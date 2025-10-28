export default async function handler(req, res) {
  try {
    const { text } = await req.json();

    const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: text,
        voice: "alloy",
      }),
    });

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      throw new Error(`TTS failed: ${errorText}`);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error("TTS API Error:", error);
    res.status(500).json({ error: "Failed to generate speech." });
  }
}
