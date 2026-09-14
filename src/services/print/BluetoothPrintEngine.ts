// src/services/print/BluetoothPrintEngine.ts

export const BluetoothPrintEngine = {
  async connect() {
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: ['printer'] }]
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('printer');
      const characteristic = await service.getCharacteristic('printer_characteristic');
      return { device, characteristic };
    } catch (error) {
      console.error('Bluetooth connection failed:', error);
      throw error;
    }
  },

  async print(characteristic: any, data: Uint8Array) {
    try {
      await characteristic.writeValue(data);
    } catch (error) {
      console.error('Printing failed:', error);
      throw error;
    }
  }
};
