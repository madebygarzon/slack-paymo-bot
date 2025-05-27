import { App, SocketModeReceiver } from "@slack/bolt";
import axios from "axios";

// 1) Validación de env vars
const appToken = process.env.SLACK_APP_TOKEN;
if (!appToken) throw new Error("Falta SLACK_APP_TOKEN");

const botToken = process.env.SLACK_BOT_TOKEN;
if (!botToken) throw new Error("Falta SLACK_BOT_TOKEN");

const signingSecret = process.env.SLACK_SIGNING_SECRET;
if (!signingSecret) throw new Error("Falta SLACK_SIGNING_SECRET");

const paymoKey = process.env.PAYMO_API_KEY;
if (!paymoKey) throw new Error("Falta PAYMO_API_KEY");

// 2) Mapeo estático Slack→Paymo
const slackIdToPaymo: Record<string, string> = {
  "U1234ABCD": "987654",
  "U5678EFGH": "123456",
};

function mapUser(slackId: string): string {
  const paymoId = slackIdToPaymo[slackId];
  if (!paymoId) throw new Error(`No mapeo para Slack ID ${slackId}`);
  return paymoId;
}

// 3) Crea el receptor en Socket Mode
const receiver = new SocketModeReceiver({ appToken });

// 4) Inicializa la App pasando el signingSecret aquí
const app = new App({
  token: botToken,
  signingSecret,
  receiver,
});

// 5) Cliente de Paymo
const paymo = axios.create({
  baseURL: "https://app.paymoapp.com/api",
  auth: { username: paymoKey, password: "x" },
});

// 6) Comando /track
app.command("/track", async ({ command, ack, respond }) => {
  await ack();

  let paymoUserId: string;
  try {
    paymoUserId = mapUser(command.user_id);
  } catch (e: any) {
    return respond(`❌ ${e.message}`);
  }

  const [action, taskId] = command.text.split(/\s+/);
  try {
    if (action === "start") {
      const { data } = await paymo.post("/timeentries", {
        task_id: taskId,
        user_id: paymoUserId,
        start_time: new Date().toISOString(),
        duration: 0,
      });
      return respond(`▶️ Cronómetro iniciado (id: ${data.id}).`);
    }
    if (action === "stop") {
      const { data } = await paymo.get("/timeentries", {
        params: { where: `user_id=${paymoUserId};duration=0` },
      });
      if (!data.length) throw new Error("No hay time entry en curso.");
      await paymo.put(`/timeentries/${data[0].id}`, {
        end_time: new Date().toISOString(),
      });
      return respond("⏹️ Cronómetro parado y registrado.");
    }
    return respond("Uso: `/track start <taskId>` o `/track stop`.");
  } catch (err: any) {
    return respond(`❌ Error: ${err.message}`);
  }
});

// 7) Arranca Socket Mode
(async () => {
  await receiver.start();
  console.log("⚡️ Socket Mode activo");
})();
