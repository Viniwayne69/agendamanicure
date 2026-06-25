const admin = require("firebase-admin");

function getAdminApp() {
  if (admin.apps.length) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin environment variables.");
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    getAdminApp();

    const { appointmentId } = req.body || {};
    if (!appointmentId || typeof appointmentId !== "string") {
      return res.status(400).json({ error: "Missing appointmentId" });
    }

    const db = admin.firestore();
    const appointmentRef = db.collection("appointments").doc(appointmentId);
    const appointmentSnapshot = await appointmentRef.get();

    if (!appointmentSnapshot.exists) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    const appointment = appointmentSnapshot.data();
    if (!appointment || appointment.status !== "confirmed") {
      return res.status(200).json({ skipped: true });
    }

    const alreadyNotified = appointment.ownerNotifiedAt;
    if (alreadyNotified) {
      return res.status(200).json({ skipped: true, reason: "already_notified" });
    }

    const tokensSnapshot = await db.collection("ownerNotificationTokens").get();
    const tokens = tokensSnapshot.docs
      .map(doc => ({ id: doc.id, token: doc.data().token }))
      .filter(item => item.token);

    if (!tokens.length) {
      return res.status(200).json({ sent: 0 });
    }

    const appUrl = process.env.APP_URL || "https://calendariomanicure-f7bd1.vercel.app";
    const response = await admin.messaging().sendEachForMulticast({
      notification: {
        title: "Nova reserva na Nail Agenda",
        body: `${appointment.clientName} reservou ${appointment.serviceName} para ${appointment.date} às ${appointment.time}.`
      },
      webpush: {
        fcmOptions: {
          link: appUrl
        },
        notification: {
          icon: `${appUrl}/icon.svg`,
          badge: `${appUrl}/icon.svg`,
          requireInteraction: true
        }
      },
      tokens: tokens.map(item => item.token)
    });

    const invalidTokens = [];
    response.responses.forEach((result, index) => {
      if (!result.success) {
        const code = result.error && result.error.code;
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
          invalidTokens.push(tokens[index].id);
        }
      }
    });

    await Promise.all([
      appointmentRef.update({
        ownerNotifiedAt: admin.firestore.FieldValue.serverTimestamp()
      }),
      ...invalidTokens.map(id => db.collection("ownerNotificationTokens").doc(id).delete())
    ]);

    return res.status(200).json({
      sent: response.successCount,
      failed: response.failureCount
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not send notification" });
  }
};
