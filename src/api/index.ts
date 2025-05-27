import { App, ExpressReceiver } from "@slack/bolt";
import axios from "axios";

// 1) Mapeo estático Slack→Paymo (reemplaza IDs de ejemplo con los de tu equipo)
const slackIdToPaymo: Record<string, string> = {
  "U1234ABCD": "987654",
  "U5678EFGH": "123456",
  // …añade aquí cada Slack ID con su user_id de Paymo…
};

function mapUser(slackId: string): string {
  const paymoId = slackIdToPaymo[slackId];
  if (!paymoId) throw new Error(`No hay mapeo para Slack ID ${slackId}`);
  return paymoId;
}

// 2) Inicializa el receiver de Express para Vercel
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

// 3) Cliente Paymo
const paymo = axios.create({
  baseURL: "https://app.paymoapp.com/api",
  auth: { username: process.env.PAYMO_API_KEY!, password: "x" },
});

// 4) Comando /track
app.command("/track", async ({ command, ack, respond }) => {
  await ack();

  let paymoUserId: string;
  try {
    paymoUserId = mapUser(command.user_id);
  } catch (e: any) {
    return respond(`❌ ${e.message}`);
  }

  const [action, taskId] = command.text.split(/\s+/);

  if (action === "start") {
    try {
      const { data } = await paymo.post("/timeentries", {
        task_id: taskId,
        user_id: paymoUserId,
        start_time: new Date().toISOString(),
        duration: 0,
      });
      await respond(`▶️ Cronómetro iniciado (entry id: ${data.id}).`);
    } catch (err: any) {
      await respond(`❌ Error al iniciar: ${err.message}`);
    }
  } else if (action === "stop") {
    try {
      const entryId = await findRunning(paymoUserId);
      await paymo.put(`/timeentries/${entryId}`, {
        end_time: new Date().toISOString(),
      });
      await respond("⏹️ Cronómetro parado y registrado.");
    } catch (err: any) {
      await respond(`❌ Error al parar: ${err.message}`);
    }
  } else {
    await respond("Uso: `/track start <taskId>` o `/track stop`.");
  }
});

async function findRunning(paymoUserId: string): Promise<string> {
  const { data } = await paymo.get("/timeentries", {
    params: { where: `user_id=${paymoUserId};duration=0` },
  });
  if (!data.length) throw new Error("No hay ningún time entry en curso.");
  return data[0].id;
}

// 5) Exporta la app de Express para Vercel
export default receiver.app;
