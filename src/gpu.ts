// Copyright (C) 2026 Todd Kulesza <todd@dropline.net>

// This file is part of TopHat.

// TopHat is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// TopHat is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with TopHat. If not, see <https://www.gnu.org/licenses/>.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {
  ExtensionMetadata,
  gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { CapacityBar } from './capacity.js';
import {
  DisplayType,
  GBytesToHumanString,
  getDisplayTypeSetting,
} from './helpers.js';
import { HistoryChart } from './history.js';
import { Orientation, TopHatMeter } from './meter.js';
import { MeterNoVal, TopHatMonitor } from './monitor.js';
import { Vitals } from './vitals.js';

export const GpuMonitor = GObject.registerClass(
  class GpuMonitor extends TopHatMonitor {
    private usage;
    private vramIcon;
    private vramMeter;
    private vramUsage;
    private menuGpuDevice;
    private menuGpuUsage;
    private menuGpuCap;
    private menuGpuCoreClock;
    private menuGpuMemClock;
    private menuGpuVoltage;
    private menuGpuPower;
    private menuGpuTemp;
    private menuGpuTempJunction;
    private menuGpuTempMem;
    private menuVramCap;
    private menuVramUsage;
    private menuVramDetails;
    private displayType: DisplayType;
    private vramDisplayType: DisplayType;

    constructor(metadata: ExtensionMetadata, gsettings: Gio.Settings) {
      super('GPU Monitor', metadata, gsettings);

      const gicon = Gio.icon_new_for_string(
        `${this.metadata.path}/icons/hicolor/scalable/actions/gpu-icon-symbolic.svg`
      );
      this.icon.set_gicon(gicon);

      this.usage = new St.Label({
        text: MeterNoVal,
        style_class: 'tophat-panel-usage tophat-panel-usage-wider',
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.add_child(this.usage);

      this.meter.setNumBars(1);
      this.meter.setOrientation(Orientation.Vertical);
      this.add_child(this.meter);

      const vramGicon = Gio.icon_new_for_string(
        `${this.metadata.path}/icons/hicolor/scalable/actions/vram-icon-symbolic.svg`
      );
      this.vramIcon = new St.Icon({
        gicon: vramGicon,
        style_class:
          'system-status-icon tophat-panel-icon tophat-panel-icon-secondary',
      });
      this.add_child(this.vramIcon);

      this.vramUsage = new St.Label({
        text: MeterNoVal,
        style_class: 'tophat-panel-usage tophat-panel-usage-wider',
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.add_child(this.vramUsage);

      this.vramMeter = new TopHatMeter();
      this.vramMeter.setNumBars(1);
      this.vramMeter.setOrientation(Orientation.Vertical);
      this.vramMeter.add_style_class_name('tophat-meter-secondary');
      this.add_child(this.vramMeter);

      this.menuGpuUsage = new St.Label();
      this.menuGpuCap = new CapacityBar();
      this.menuGpuDevice = new St.Label();
      this.menuGpuCoreClock = new St.Label();
      this.menuGpuMemClock = new St.Label();
      this.menuGpuVoltage = new St.Label();
      this.menuGpuPower = new St.Label();
      this.menuGpuTemp = new St.Label();
      this.menuGpuTempJunction = new St.Label();
      this.menuGpuTempMem = new St.Label();
      this.menuVramCap = new CapacityBar();
      this.menuVramUsage = new St.Label();
      this.menuVramDetails = new St.Label();
      this.historyChart = new HistoryChart();

      this.displayType = this.updateDisplayType();
      let id = this.gsettings.connect('changed::gpu-display', () => {
        this.updateDisplayType();
      });
      this.settingsSignals.push(id);
      this.vramDisplayType = this.updateVramDisplayType();
      id = this.gsettings.connect('changed::gpu-vram-display', () => {
        this.updateVramDisplayType();
      });
      this.settingsSignals.push(id);
      this.visible = gsettings.get_boolean('show-gpu');
      id = this.gsettings.connect(
        'changed::show-gpu',
        (settings: Gio.Settings) => {
          this.visible = settings.get_boolean('show-gpu');
        }
      );
      this.settingsSignals.push(id);

      this.buildMenu();
      this.addMenuButtons();
      this.updateColor();
    }

    private updateDisplayType() {
      this.displayType = getDisplayTypeSetting(this.gsettings, 'gpu-display');
      if (this.displayType === DisplayType.Both) {
        this.usage.show();
        this.meter.show();
      } else if (this.displayType === DisplayType.Chart) {
        this.usage.hide();
        this.meter.show();
      } else {
        this.usage.show();
        this.meter.hide();
      }
      return this.displayType;
    }

    private updateVramDisplayType() {
      this.vramDisplayType = getDisplayTypeSetting(
        this.gsettings,
        'gpu-vram-display'
      );
      this.vramIcon.show();
      if (this.vramDisplayType === DisplayType.Both) {
        this.vramMeter.show();
        this.vramUsage.show();
      } else if (this.vramDisplayType === DisplayType.Chart) {
        this.vramMeter.show();
        this.vramUsage.hide();
      } else {
        this.vramMeter.hide();
        this.vramUsage.show();
      }
      return this.vramDisplayType;
    }

    private buildMenu() {
      let label = new St.Label({
        text: _('Graphics usage'),
        style_class: 'tophat-menu-header',
      });
      this.addMenuRow(label, 0, 2, 1);

      label = new St.Label({
        text: _('GPU utilization:'),
        style_class: 'tophat-menu-label',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuGpuUsage.text = MeterNoVal;
      this.menuGpuUsage.add_style_class_name('tophat-menu-value');
      this.addMenuRow(this.menuGpuUsage, 1, 1, 1);
      this.addMenuRow(this.menuGpuCap, 0, 2, 1);
      this.menuGpuDevice.text = MeterNoVal;
      this.menuGpuDevice.add_style_class_name(
        'tophat-menu-details align-right tophat-menu-gpu-device'
      );
      this.menuGpuDevice.clutter_text.line_wrap = true;
      this.menuGpuDevice.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
      this.menuGpuDevice.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
      this.addMenuRow(this.menuGpuDevice, 0, 2, 1);

      label = new St.Label({
        text: _('Core clock:'),
        style_class: 'tophat-menu-label tophat-menu-details',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuGpuCoreClock.text = MeterNoVal;
      this.menuGpuCoreClock.add_style_class_name(
        'tophat-menu-value tophat-menu-details'
      );
      this.addMenuRow(this.menuGpuCoreClock, 1, 1, 1);

      label = new St.Label({
        text: _('Memory clock:'),
        style_class: 'tophat-menu-label tophat-menu-details',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuGpuMemClock.text = MeterNoVal;
      this.menuGpuMemClock.add_style_class_name(
        'tophat-menu-value tophat-menu-details'
      );
      this.addMenuRow(this.menuGpuMemClock, 1, 1, 1);

      label = new St.Label({
        text: _('Voltage:'),
        style_class: 'tophat-menu-label tophat-menu-details',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuGpuVoltage.text = MeterNoVal;
      this.menuGpuVoltage.add_style_class_name(
        'tophat-menu-value tophat-menu-details'
      );
      this.addMenuRow(this.menuGpuVoltage, 1, 1, 1);

      label = new St.Label({
        text: _('Power:'),
        style_class: 'tophat-menu-label tophat-menu-details',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuGpuPower.text = MeterNoVal;
      this.menuGpuPower.add_style_class_name(
        'tophat-menu-value tophat-menu-details'
      );
      this.addMenuRow(this.menuGpuPower, 1, 1, 1);

      label = new St.Label({
        text: _('Edge temp:'),
        style_class: 'tophat-menu-label tophat-menu-details',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuGpuTemp.text = MeterNoVal;
      this.menuGpuTemp.add_style_class_name(
        'tophat-menu-value tophat-menu-details'
      );
      this.addMenuRow(this.menuGpuTemp, 1, 1, 1);

      label = new St.Label({
        text: _('Junction temp:'),
        style_class: 'tophat-menu-label tophat-menu-details',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuGpuTempJunction.text = MeterNoVal;
      this.menuGpuTempJunction.add_style_class_name(
        'tophat-menu-value tophat-menu-details'
      );
      this.addMenuRow(this.menuGpuTempJunction, 1, 1, 1);

      label = new St.Label({
        text: _('VRAM temp:'),
        style_class:
          'tophat-menu-label tophat-menu-details tophat-menu-section-end',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuGpuTempMem.text = MeterNoVal;
      this.menuGpuTempMem.add_style_class_name(
        'tophat-menu-value tophat-menu-details tophat-menu-section-end'
      );
      this.addMenuRow(this.menuGpuTempMem, 1, 1, 1);

      label = new St.Label({
        text: _('VRAM used:'),
        style_class: 'tophat-menu-label',
      });
      this.addMenuRow(label, 0, 1, 1);
      this.menuVramUsage.text = MeterNoVal;
      this.menuVramUsage.add_style_class_name('tophat-menu-value');
      this.addMenuRow(this.menuVramUsage, 1, 1, 1);
      this.addMenuRow(this.menuVramCap, 0, 2, 1);
      this.menuVramDetails.text = MeterNoVal;
      this.menuVramDetails.add_style_class_name(
        'tophat-menu-details align-right tophat-menu-section-end'
      );
      this.addMenuRow(this.menuVramDetails, 0, 2, 1);

      if (this.historyChart) {
        this.addMenuRow(this.historyChart, 0, 2, 1);
      }
    }

    public override bindVitals(vitals: Vitals): void {
      super.bindVitals(vitals);

      let id = vitals.connect('notify::gpu-usage', () => {
        this.updateUsage(vitals);
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::gpu-device-name', () => {
        this.menuGpuDevice.text = vitals.gpu_device_name || MeterNoVal;
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::gpu-vram-size', () => {
        this.updateVramText(vitals);
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::gpu-vram-size-used', () => {
        this.updateVramText(vitals);
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::gpu-history', () => {
        this.historyChart?.update(vitals.getGpuHistory());
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::gpu-core-clock', () => {
        this.menuGpuCoreClock.text = formatMHz(vitals.gpu_core_clock);
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::gpu-mem-clock', () => {
        this.menuGpuMemClock.text = formatMHz(vitals.gpu_mem_clock);
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::gpu-voltage', () => {
        this.menuGpuVoltage.text = formatMilliVolts(vitals.gpu_voltage);
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::gpu-power', () => {
        this.menuGpuPower.text = formatWatts(vitals.gpu_power);
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::gpu-temp', () => {
        this.menuGpuTemp.text = formatCelsius(vitals.gpu_temp);
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::gpu-temp-junction', () => {
        this.menuGpuTempJunction.text = formatCelsius(vitals.gpu_temp_junction);
      });
      this.vitalsSignals.push(id);

      id = vitals.connect('notify::gpu-temp-mem', () => {
        this.menuGpuTempMem.text = formatCelsius(vitals.gpu_temp_mem);
      });
      this.vitalsSignals.push(id);

      this.updateUsage(vitals);
      this.menuGpuDevice.text = vitals.gpu_device_name || MeterNoVal;
      this.updateVramText(vitals);
      this.menuGpuCoreClock.text = formatMHz(vitals.gpu_core_clock);
      this.menuGpuMemClock.text = formatMHz(vitals.gpu_mem_clock);
      this.menuGpuVoltage.text = formatMilliVolts(vitals.gpu_voltage);
      this.menuGpuPower.text = formatWatts(vitals.gpu_power);
      this.menuGpuTemp.text = formatCelsius(vitals.gpu_temp);
      this.menuGpuTempJunction.text = formatCelsius(vitals.gpu_temp_junction);
      this.menuGpuTempMem.text = formatCelsius(vitals.gpu_temp_mem);
    }

    protected override updateColor(): [string, boolean] {
      const [color, useAccent] = super.updateColor();
      this.menuGpuCap?.setColor(color);
      this.menuVramCap?.setColor(color);
      this.vramMeter?.setColor(color);
      return [color, useAccent];
    }

    private updateVramText(vitals: Vitals) {
      if (vitals.gpu_vram_size <= 0) {
        this.vramUsage.text = MeterNoVal;
        this.vramMeter.setBarSizes([0]);
        this.menuVramCap.setUsage(0);
        this.menuVramUsage.text = MeterNoVal;
        this.menuVramDetails.text = MeterNoVal;
        return;
      }

      const ratio = Math.max(
        0,
        Math.min(1, vitals.gpu_vram_size_used / vitals.gpu_vram_size)
      );
      const total = GBytesToHumanString(vitals.gpu_vram_size);
      const used = GBytesToHumanString(vitals.gpu_vram_size_used);
      const free = GBytesToHumanString(
        vitals.gpu_vram_size - vitals.gpu_vram_size_used
      );
      this.vramMeter.setBarSizes([ratio]);
      this.menuVramCap.setUsage(ratio);
      this.vramUsage.text = used;
      this.menuVramUsage.text = _(`${used} of ${total}`);
      this.menuVramDetails.text = _(`${free} available of ${total}`);
    }

    private updateUsage(vitals: Vitals) {
      if (vitals.gpu_usage < 0) {
        this.usage.text = MeterNoVal;
        this.menuGpuUsage.text = MeterNoVal;
        this.meter.setBarSizes([0]);
        this.menuGpuCap.setUsage(0);
        return;
      }

      const percent = vitals.gpu_usage * 100;
      const s = percent.toFixed(0) + '%';
      this.usage.text = s;
      this.menuGpuUsage.text = s;
      this.meter.setBarSizes([vitals.gpu_usage]);
      this.menuGpuCap.setUsage(vitals.gpu_usage);
    }
  }
);

function formatMHz(value: number): string {
  if (value <= 0) {
    return MeterNoVal;
  }
  return `${value} MHz`;
}

function formatMilliVolts(value: number): string {
  if (value <= 0) {
    return MeterNoVal;
  }
  return `${value} mV`;
}

function formatWatts(value: number): string {
  if (value <= 0) {
    return MeterNoVal;
  }
  return `${value} W`;
}

function formatCelsius(value: number): string {
  if (value <= 0) {
    return MeterNoVal;
  }
  return `${value}°C`;
}

export type GpuMonitor = InstanceType<typeof GpuMonitor>;
