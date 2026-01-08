const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = process.env.COOKIE_KEY || 'secretKeyShouldBe32CharsLong1234'; // Ensure 32 bytes in prod
// For MVP/Demo, we might need a fixed IV or store IV with data. storing IV with data is best.

const encrypt = (text) => {
    const iv = crypto.randomBytes(16);
    // Pad key to 32 bytes if needed for the demo, in prod use proper key management
    const key = crypto.scryptSync(SECRET_KEY, 'salt', 32);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text) => {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const key = crypto.scryptSync(SECRET_KEY, 'salt', 32);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
};

module.exports = { encrypt, decrypt };
