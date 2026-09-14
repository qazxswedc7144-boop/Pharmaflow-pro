import CryptoJS from 'crypto-js';

export const triggerBackup = async (data: any, password: string) => {
    const jsonString = JSON.stringify(data);
    const encrypted = CryptoJS.AES.encrypt(jsonString, password).toString();
    const blob = new Blob([encrypted], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-${new Date().toISOString()}.enc`;
    a.click();
    URL.revokeObjectURL(url);
};
