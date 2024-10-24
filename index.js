const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");

const useMySQLAuthState = require("./bd");

const log = (pino = require("pino"));
const { session } = { session: "session_auht_info" };
const { Boom } = require("@hapi/boom"); // manejar errores
const path = require("path"); // interactuar con el sistema de archivos y módulos de Node.js
const fs = require("fs"); // interactuar con el sistema de archivos y módulos de Node.js

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser"); // para analizar las solicitudes HTTP

const app = express();

// gestionar solicitudes HTTP con datos JSON y formularios
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const server = require("http").createServer(app);
const io = require("socket.io")(server); // integracion de socket
const port = process.env.PORT || 3000;
const qrcode = require("qrcode");

app.use("assets", express.static(__dirname + "client/assets"));

app.get("/scan", (req, res) => {
  res.sendFile("./client/index.html", {
    root: __dirname,
  });
});
app.get("/", (req, res) => {
  res.send("Hello World!");
});

let qrDinamic;
let soket;

async function connectToWhatsApp() {
  // * const { state, saveCreds } = await useMultiFileAuthState("session_auth_info");
  const { state, saveCreds } = await useMySQLAuthState("session_auth_info");

  sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
    logger: log({ level: "silent" }),
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    qrDinamic = qr;
    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log("Motivo de desconexión: ", reason);

      if (reason === DisconnectReason.loggedOut) {
        console.log("Dispositivo cerrado. Borrar sesión y reescanear.");
        await sock.logout();
      } else if (
        reason === DisconnectReason.restartRequired ||
        reason === DisconnectReason.timedOut
      ) {
        console.log("Reconectando después de reinicio o tiempo agotado...");
        connectToWhatsApp();
      } else {
        console.log("Motivo desconocido, finalizando conexión...");
        sock.end();
      }
    } else if (connection === "open") {
      console.log("Conexión abierta y lista");
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

const isConnected = () => {
  return sock?.user ? true : false;
};

app.get("/send-message", async (req, res) => {
  if (isConnected()) {
    await sock.sendMessage("51934680481@c.us", { text: "Hola!" });
    return;
  } else {
    res.status(500).json({
      status: false,
      response: "Aun no estas conectado",
    });
  }
});

connectToWhatsApp().catch((err) => console.log("unexpected error: " + err)); // catch any errors
server.listen(port, () => {
  console.log("Server Run Port : " + port);
});
