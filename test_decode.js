
function decodeApiKey(encoded) {
    const pwd = 'crtv_secure_2026';
    let raw = Buffer.from(encoded, 'base64').toString('binary');
    let decoded = '';
    for (let i = 0; i < raw.length; i++) {
        decoded += String.fromCharCode(raw.charCodeAt(i) ^ pwd.charCodeAt(i % pwd.length));
    }
    return decoded;
}

const key = "IjsOFwwKJAInC1MQXkMLUQUQHS8bCggLMDghckR4Ck5VNCMaJzIO";
console.log("Decoded Key:", decodeApiKey(key));
