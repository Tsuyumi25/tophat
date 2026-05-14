{
  description = "TopHat GNOME Shell extension";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      overlays.default = final: prev: {
        gnomeExtensions = prev.gnomeExtensions // {
          tophat = self.packages.${final.system}.default;
        };
      };

      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          lib = pkgs.lib;
          metadata = builtins.fromJSON (builtins.readFile ./resources/metadata.json);
          yarnCompatPatch = ''
            sed -i '/"packageManager": "yarn@4.9.2",/d' package.json

            if ! grep -q '^approvedGitRepositories:' .yarnrc.yml; then
              cat >> .yarnrc.yml <<'EOF'

            approvedGitRepositories:
              - "**"
            EOF
            fi

            if ! grep -q '^enableScripts:' .yarnrc.yml; then
              printf '\nenableScripts: true\n' >> .yarnrc.yml
            fi

            sed -i '0,/^  version: 8$/s//  version: 9/' yarn.lock
          '';
          src = lib.cleanSourceWith {
            src = ./.;
            filter =
              path: type:
              let
                relPath = lib.removePrefix "${toString ./.}/" (toString path);
                base = baseNameOf (toString path);
              in
              !(lib.elem base [
                ".git"
                "dist"
                "node_modules"
                ".codex"
              ])
              && relPath != "HANDOFF-GPU.md";
          };
        in
        rec {
          default = pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
            pname = "gnome-shell-extension-tophat";
            version = toString metadata.version;

            inherit src;

            offlineCache = pkgs.yarn-berry_4.fetchYarnBerryDeps {
              inherit src;
              postPatch = yarnCompatPatch;
              hash = "sha256-eSd7TNdUU9Rj+8IIn6YlObrlRV0U/LVrldwJUfLxK9I=";
            };

            nativeBuildInputs = [
              pkgs.glib
              pkgs.nodejs
              pkgs.yarn-berry_4
              pkgs.yarn-berry_4.yarnBerryConfigHook
            ];

            postPatch = yarnCompatPatch;

            buildPhase = ''
              runHook preBuild
              yarn build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              install -d "$out/share/gnome-shell/extensions/${metadata.uuid}"
              cp -r -T dist "$out/share/gnome-shell/extensions/${metadata.uuid}"
              runHook postInstall
            '';

            passthru = {
              extensionPortalSlug = "tophat";
              extensionUuid = metadata.uuid;
            };

            meta = {
              description = metadata.description;
              homepage = metadata.url;
              license = lib.licenses.gpl3Plus;
              platforms = lib.platforms.linux;
            };
          });

          tophat = default;
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.glib
              pkgs.nodejs
              pkgs.yarn-berry_4
            ];
          };
        }
      );
    };
}
