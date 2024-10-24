const { proto } = require("@whiskeysockets/baileys/WAProto");
const {
  Curve,
  signedKeyPair,
} = require("@whiskeysockets/baileys/lib/Utils/crypto");
const {
  generateRegistrationId,
} = require("@whiskeysockets/baileys/lib/Utils/generics");
const { BufferJSON } = require("@whiskeysockets/baileys");

const { randomBytes } = require("crypto");

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "chatbot-demo",
});
// Función para escribir datos en MySQL
const writeData = async (data, id) => {
  const conn = await pool.getConnection();
  try {
    const jsonData = JSON.stringify(data, BufferJSON.replacer);
    await conn.query(
      `INSERT INTO whatsapp_auth (id, data) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data)`,
      [id, jsonData]
    );
  } finally {
    conn.release();
  }
};

// Función para leer datos de MySQL
const readData = async (id) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT data FROM whatsapp_auth WHERE id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return null;
    }
    return JSON.parse(rows[0].data, BufferJSON.reviver);
  } catch (error) {
    console.error("Error leyendo datos:", error);
    return null;
  } finally {
    conn.release();
  }
};

// Función para eliminar datos de MySQL
const removeData = async (id) => {
  const conn = await pool.getConnection();
  try {
    await conn.query(`DELETE FROM whatsapp_auth WHERE id = ?`, [id]);
  } finally {
    conn.release();
  }
};

const initAuthCreds = () => {
  const identityKey = Curve.generateKeyPair();
  return {
    noiseKey: Curve.generateKeyPair(),
    signedIdentityKey: identityKey,
    signedPreKey: signedKeyPair(identityKey, 1),
    registrationId: generateRegistrationId(),
    advSecretKey: randomBytes(32).toString("base64"),
    processedHistoryMessages: [],
    nextPreKeyId: 1,
    firstUnuploadedPreKeyId: 1,
    accountSettings: {
      unarchiveChats: false,
    },
  };
};

module.exports = useMySQLAuthState = async () => {
  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key") {
                value = proto.Message.AppStateSyncKeyData.fromObject(data);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => {
      return writeData(creds, "creds");
    },
  };
};
