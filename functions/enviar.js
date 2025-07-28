const Pusher = require('pusher');
const OpenAI = require('openai');

// Configuración segura usando variables de entorno de Netlify
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { sender, clientId } = body;

    // --- LÓGICA CLAVE: Diferenciar mensajes del Control vs. del Cliente ---

    // CASO 1: El mensaje viene del Panel de Control (tiene la bandera 'fromControl')
    if (body.fromControl) {
      // El mensaje es tuyo. Solo retransmítelo. No llames a GPT.
      await pusher.trigger('chataurelio', 'chatbidireccion', {
        sender: sender,         // Tu nombre (ej: "Soporte")
        message: body.message,  // Tu mensaje
        clientId: clientId
      });

    // CASO 2: El mensaje viene de un cliente (no tiene la bandera)
    } else {
      const { originalMessage, messageForGpt } = body;
      if (!sender || !originalMessage || !messageForGpt) {
        throw new Error('Faltan campos requeridos del cliente');
      }

      // Retransmite el mensaje original del cliente para que lo veas en tu panel
      await pusher.trigger('chataurelio', 'chatbidireccion', {
        sender: sender,
        message: originalMessage,
        clientId: clientId
      });

      // Llama a la API de OpenAI para obtener la respuesta automática
      const gptResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Eres un asistente virtual. El usuario te enviará una instrucción y un mensaje, sigue la instrucción." },
          { role: "user", content: messageForGpt }
        ]
      });
      const gptMessage = gptResponse.choices[0].message.content;

      // Envía la respuesta de GPT al chat
      await pusher.trigger('chataurelio', 'chatbidireccion', {
        sender: 'Aurelio AI',
        message: gptMessage,
        clientId: clientId
      });
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Error en la función de Netlify:', error.message);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};