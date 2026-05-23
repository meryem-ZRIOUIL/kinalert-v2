// ============================================
// KINALERT - IA (Groq API)
// ============================================

const GROQ_CONFIG = {
    API_KEY: "",
    MODEL: "llama-3.3-70b-versatile",
    API_URL: "https://api.groq.com/openai/v1/chat/completions"
};

async function extraireInfosGroq(noticeText) {
    const systemPrompt = `Tu es un extracteur de données pharmaceutiques.
Remplis la structure JSON suivante à partir de la notice médicale.
Retourne UNIQUEMENT le JSON, sans texte avant ou après.

Structure:
{
  "medicament": { "nom": "", "dosage": "" },
  "horaires": { "heures_suggeres_notice": [] },
  "utilisation": { "mode_administration": "", "duree_traitement": "" }
}`;

    try {
        const response = await fetch(GROQ_CONFIG.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`
            },
            body: JSON.stringify({
                model: GROQ_CONFIG.MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: noticeText.substring(0, 2000) }
                ],
                temperature: 0.1,
                max_tokens: 500
            })
        });

        if (!response.ok) return null;
        
        const data = await response.json();
        const jsonText = data.choices[0]?.message?.content || '';
        const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
        
    } catch (error) {
        console.error('Erreur Groq:', error);
        return null;
    }
}

function normaliserHoraire(str) {
    if (!str) return null;
    const strClean = String(str).trim();
    if (/^\d{2}:\d{2}$/.test(strClean)) return strClean;
    const match = strClean.match(/(\d{1,2})h(?:\s*(\d{2}))?/i);
    if (match) {
        const h = parseInt(match[1]);
        const m = match[2] ? parseInt(match[2]) : 0;
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        }
    }
    return null;
}

window.extraireInfosGroq = extraireInfosGroq;
window.normaliserHoraire = normaliserHoraire;
