// ============================================
// KINALERT - IA (Groq API + Fusion + Bluetooth)
// Adapté pour ports A, B (lettres) + Django template
// ============================================

const GROQ_CONFIG = {
    API_KEY: "",
    MODEL:   "llama-3.3-70b-versatile",
    API_URL: "https://api.groq.com/openai/v1/chat/completions"
};

// -----------------------------------------------
// portConfig : calé sur les ports A, B du HTML
// -----------------------------------------------
function creerPortVide() {
    return { medicament:'', horaires:[], actif:false, noticeText:'', noticeJSON:null, dose:'', notes:'' };
}

function initPortConfig() {
    if (!window.portConfig) {
        try {
            const saved = localStorage.getItem('kinalert_portConfig');
            if (saved) {
                window.portConfig = JSON.parse(saved);
                ['A','B'].forEach(p => {
                    if (!window.portConfig[p]) window.portConfig[p] = creerPortVide();
                    window.portConfig[p].noticeText = window.portConfig[p].noticeText || '';
                    window.portConfig[p].noticeJSON = window.portConfig[p].noticeJSON || null;
                });
                return;
            }
        } catch(e) {}
        window.portConfig = { A: creerPortVide(), B: creerPortVide() };
    } else {
        ['A','B'].forEach(p => {
            if (!window.portConfig[p]) window.portConfig[p] = creerPortVide();
            window.portConfig[p].noticeText = window.portConfig[p].noticeText || '';
            window.portConfig[p].noticeJSON = window.portConfig[p].noticeJSON || null;
        });
    }
}

function savePortConfig(port) {
    try {
        const toSave = {};
        Object.keys(window.portConfig).forEach(p => {
            toSave[p] = { ...window.portConfig[p], noticeText: '' };
        });
        localStorage.setItem('kinalert_portConfig', JSON.stringify(toSave));
    } catch(e) { console.warn('[KinAlert] localStorage indisponible:', e); }
}

function getPortConfig() {
    if (!window.portConfig) initPortConfig();
    return window.portConfig;
}

initPortConfig();

// -----------------------------------------------
// ÉTAPE 3 → 4 : Groq → JSON structuré
// -----------------------------------------------
async function extraireInfosGroq(noticeText) {
    const systemPrompt = `Tu es un extracteur de données pharmaceutiques expert.
Tu lis une notice médicale et tu remplis EXACTEMENT la structure JSON fournie.
Règles strictes :
- Réponds UNIQUEMENT avec le JSON, sans texte avant ni après, sans backticks markdown.
- Si une information est absente, laisse la valeur par défaut (null, [], false, 0, "").
- Les horaires doivent être au format "HH:MM" (ex: "08:00", "21:00").
- Les listes doivent être des tableaux même si un seul élément.
- "ia.confiance_extraction" est un score entre 0.0 et 1.0 que tu estimes toi-même.
- "ia.champs_manquants" liste les clés que tu n'as pas pu remplir.`;

    const structureJSON = `{
  "medicament": { "nom": "", "nom_commercial": "", "principe_actif": [], "classe_therapeutique": "", "forme": "", "dosage": "", "fabricant": "", "pays": "" },
  "utilisation": { "indications": [], "mode_administration": "", "dose_recommandee": "", "frequence": "", "duree_traitement": "", "avant_repas": false, "apres_repas": false, "avec_eau": true },
  "horaires": { "heures_suggeres_notice": [], "matin": false, "midi": false, "soir": false, "dose_par_prise": "", "frequence_par_jour": 0, "intervalle_heures": 0 },
  "contre_indications": [],
  "precautions": [],
  "effets_secondaires": { "courants": [], "graves": [] },
  "interactions": { "medicaments": [], "aliments": [], "alcool": false },
  "population_speciale": { "grossesse": "", "allaitement": "", "enfants": "", "personnes_agees": "", "insuffisance_renale": "", "insuffisance_hepatique": "" },
  "surdosage": { "symptomes": [], "action_urgence": "" },
  "oubli_dose": "",
  "conservation": { "temperature": "", "lumiere": false, "humidite": false },
  "alertes_importantes": [],
  "resume_simple": "",
  "ia": { "confiance_extraction": 0.0, "champs_manquants": [] }
}`;

    try {
        const response = await fetch(GROQ_CONFIG.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}` },
            body: JSON.stringify({
                model: GROQ_CONFIG.MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Remplis cette structure JSON à partir de la notice médicale suivante.\nRetourne UNIQUEMENT le JSON complété, sans aucun texte autour.\n\nSTRUCTURE À REMPLIR :\n${structureJSON}\n\nNOTICE MÉDICALE :\n${noticeText.substring(0, 3000)}` }
                ],
                temperature: 0.1,
                max_tokens: 2000
            })
        });

        if (!response.ok) { console.error('Groq API error:', await response.text()); return null; }

        const data      = await response.json();
        const rawText   = data.choices?.[0]?.message?.content || '';
        const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const resultat  = JSON.parse(cleanJson);

        if (!resultat.medicament || !resultat.horaires) { console.error('JSON Groq incomplet'); return null; }

        if (Array.isArray(resultat.horaires?.heures_suggeres_notice)) {
            resultat.horaires.heures_suggeres_notice = resultat.horaires.heures_suggeres_notice
                .map(h => normaliserHoraire(h)).filter(Boolean).sort();
        }

        const heures = resultat.horaires.heures_suggeres_notice || [];
        if (heures.length > 0) {
            resultat.horaires.matin = heures.some(h => { const hr = parseInt(h); return hr >= 6  && hr < 12; });
            resultat.horaires.midi  = heures.some(h => { const hr = parseInt(h); return hr >= 12 && hr < 15; });
            resultat.horaires.soir  = heures.some(h => { const hr = parseInt(h); return hr >= 15 && hr <= 23; });
        }

        resultat._extracted_at = new Date().toISOString();
        return resultat;

    } catch (error) { console.error('Erreur Groq:', error); return null; }
}

// -----------------------------------------------
// ÉTAPE 4 → 5 : Fusion JSON Groq + config manuelle
// -----------------------------------------------
function fusionnerAvecConfig(port, resultatGroq) {
    if (!resultatGroq) return null;

    const pc  = getPortConfig();
    const cfg = pc[port];

    const nomMed     = resultatGroq.medicament?.nom_commercial || resultatGroq.medicament?.nom || '';
    const dosage     = resultatGroq.medicament?.dosage || '';
    const nomAffiche = [nomMed, dosage].filter(Boolean).join(' ');

    if (nomAffiche) {
        cfg.medicament = nomAffiche;
        const medInput = document.getElementById(`med${port}`);
        if (medInput) medInput.value = nomAffiche;
    }
    if (dosage) {
        const dosageInput = document.getElementById(`dosage${port}`);
        if (dosageInput) dosageInput.value = dosage;
    }

    const heuresGroq      = resultatGroq.horaires?.heures_suggeres_notice || [];
    const heuresManuelles = (window.schedules && window.schedules[port]) ? window.schedules[port] : (cfg.horaires || []);
    const heuresFusionnees = [...new Set([...heuresManuelles, ...heuresGroq])]
        .map(h => normaliserHoraire(h)).filter(Boolean).sort();

    cfg.horaires = heuresFusionnees;
    if (window.schedules) window.schedules[port] = heuresFusionnees;
    if (typeof renderSchedules === 'function') renderSchedules(port);

    resultatGroq.planning = {
        medicament:        nomAffiche || cfg.medicament,
        heures_confirmees: heuresFusionnees,
        heures_UI:         heuresManuelles,
        heures_notice:     heuresGroq,
        dose_par_prise:    resultatGroq.utilisation?.dose_recommandee || '',
        frequence:         resultatGroq.utilisation?.frequence         || '',
        duree_traitement:  resultatGroq.utilisation?.duree_traitement  || '',
        avant_repas:       resultatGroq.utilisation?.avant_repas      ?? false,
        apres_repas:       resultatGroq.utilisation?.apres_repas      ?? false,
        avec_eau:          resultatGroq.utilisation?.avec_eau         ?? true,
        resume_simple:     resultatGroq.resume_simple                  || '',
        alertes:           resultatGroq.alertes_importantes            || []
    };

    cfg.noticeJSON = resultatGroq;
    return resultatGroq;
}

// -----------------------------------------------
// TÉLÉCHARGEMENT : JSON enrichi avec les infos du port
// Appelé uniquement depuis savePort() après sauvegarde
// -----------------------------------------------
function telechargerJSON(port) {
    const pc   = getPortConfig();
    const json = pc[port]?.noticeJSON;

    if (!json) {
        alert(`❌ Port ${port} : aucune analyse IA disponible. Scannez ou uploadez une notice d'abord.`);
        return;
    }

    // ── Lire les valeurs actuelles du formulaire du port ──
    const nomUI    = (document.getElementById(`med${port}`)?.value    || '').trim();
    const dosageUI = (document.getElementById(`dosage${port}`)?.value || '').trim();
    const typeUI   = (document.getElementById(`type${port}`)?.value   || '').trim();
    const dureeUI  = (document.getElementById(`duree${port}`)?.value  || '').trim();
    const horairesUI = (window.schedules && window.schedules[port]) ? window.schedules[port] : (pc[port]?.horaires || []);

    // ── Enrichir le JSON avec la config confirmée du port ──
    const jsonEnrichi = {
        ...json,
        port_config: {
            port:            port,
            nom_medicament:  nomUI   || json.medicament?.nom_commercial || json.medicament?.nom || '',
            dosage:          dosageUI || json.medicament?.dosage || '',
            type_forme:      typeUI,
            duree_jours:     dureeUI ? parseInt(dureeUI) : null,
            horaires_confirmes: horairesUI,
            sauvegarde_le:   new Date().toISOString()
        }
    };

    // Mettre à jour aussi planning.heures_confirmees
    if (jsonEnrichi.planning) {
        jsonEnrichi.planning.heures_confirmees = horairesUI;
        jsonEnrichi.planning.medicament        = nomUI || jsonEnrichi.planning.medicament;
    }

    const nom  = (nomUI || json.medicament?.nom_commercial || json.medicament?.nom || `port${port}`)
        .replace(/\s+/g, '_').toLowerCase();

    const blob = new Blob([JSON.stringify(jsonEnrichi, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `kinalert_${nom}_port${port}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// -----------------------------------------------
// AFFICHER le bouton JSON sous saveResult après sauvegarde
// Appelé depuis savePort() dans le HTML
// -----------------------------------------------
function afficherBoutonJSON(port) {
    const saveDiv = document.getElementById(`saveResult${port}`);
    if (!saveDiv) return;

    // Supprimer l'ancien bouton s'il existe déjà
    const ancien = saveDiv.querySelector('.btn-dl-json');
    if (ancien) ancien.remove();

    const pc  = getPortConfig();
    if (!pc[port]?.noticeJSON) return; // pas d'analyse IA → pas de bouton

    const btn = document.createElement('button');
    btn.className = 'btn-dl-json';
    btn.innerHTML = '📥 Télécharger le JSON complet';
    btn.style.cssText = `
        margin-top: 12px; padding: 10px 22px; background: #1e6f3f;
        color: white; border: none; border-radius: 25px;
        font-size: 13px; font-weight: 600; cursor: pointer; display: inline-block;`;
    btn.onclick = () => telechargerJSON(port);
    saveDiv.appendChild(btn);
}

// -----------------------------------------------
// ÉTAPE 5 → 6 : Sauvegarde + Bluetooth
// -----------------------------------------------
async function sauvegarderEtEnvoyer(port) {
    savePortConfig(port);
    if (typeof updatePortValidation === 'function') updatePortValidation(port);
    if (typeof afficherJSONPreview  === 'function') afficherJSONPreview(port, getPortConfig()[port]?.noticeJSON);
    if (typeof envoyerBluetooth === 'function') {
        try { await envoyerBluetooth(port); }
        catch(e) { console.warn('Bluetooth indisponible:', e); }
    }
}

// -----------------------------------------------
// PIPELINE COMPLET : OCR → Groq → Fusion → Save → BLE
// -----------------------------------------------
async function analyserNoticeAvecGroq(port, noticeText) {
    const pc        = getPortConfig();
    const noticeDiv = document.getElementById(`noticeResult${port}`);

    if (!pc[port]) pc[port] = creerPortVide();

    if (noticeDiv) {
        noticeDiv.innerHTML = '🤖 Analyse IA Groq en cours...';
        noticeDiv.style.background = '#f5f3ff';
    }

    if (noticeText) pc[port].noticeText = noticeText;

    const resultat = await extraireInfosGroq(pc[port].noticeText || noticeText || '');

    if (!resultat) {
        extractSchedulesWithIA(port);
        if (noticeDiv) {
            noticeDiv.innerHTML = '⚠️ Groq indisponible. Extraction locale appliquée.';
            noticeDiv.style.background = '#fef9c3';
        }
        return null;
    }

    fusionnerAvecConfig(port, resultat);
    await sauvegarderEtEnvoyer(port);

    // ── Résumé complet : tous les champs du JSON ──
    if (noticeDiv) {
        const r  = resultat;
        const h  = pc[port].horaires || [];
        const pct = r.ia?.confiance_extraction ? Math.round(r.ia.confiance_extraction * 100) : null;

        // Helper : ligne simple
        const row = (icon, label, val) =>
            val ? `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;white-space:nowrap;">${icon} ${label}</td>
                       <td style="padding:4px 0;font-weight:500;">${val}</td></tr>` : '';

        // Helper : liste → string
        const lst = (arr) => Array.isArray(arr) && arr.length ? arr.join(', ') : '';

        // Helper : oui/non
        const yn = (val) => val === true ? '✅ Oui' : val === false ? '❌ Non' : '';

        // Section titre
        const section = (titre) =>
            `<tr><td colspan="2" style="padding:10px 0 4px;font-weight:700;color:#0f3b5c;
             border-top:1px solid #e5e7eb;font-size:12px;text-transform:uppercase;
             letter-spacing:.05em;">${titre}</td></tr>`;

        noticeDiv.style.cssText = `
            background:#f0fdf4; border:1px solid #bbf7d0; border-radius:16px;
            padding:16px; margin:10px 0; font-size:12px; line-height:1.6;
            max-height:520px; overflow-y:auto;`;

        noticeDiv.innerHTML = `
            <!-- EN-TÊTE -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <span style="font-weight:700;color:#1e6f3f;font-size:14px;">✅ Analyse IA Groq — Résultats complets</span>
                ${pct !== null ? `<span style="background:#dcfce7;color:#166534;padding:2px 10px;
                    border-radius:20px;font-size:11px;font-weight:600;">Confiance : ${pct}%</span>` : ''}
            </div>
            ${r.resume_simple ? `<div style="background:#ecfdf5;border-left:3px solid #1e6f3f;
                padding:8px 12px;border-radius:0 8px 8px 0;margin-bottom:12px;
                font-style:italic;color:#374151;">💬 ${r.resume_simple}</div>` : ''}
            ${(r.alertes_importantes||[]).length ? `<div style="background:#fef2f2;border-left:3px solid #dc2626;
                padding:8px 12px;border-radius:0 8px 8px 0;margin-bottom:12px;color:#991b1b;">
                🚨 <strong>Alertes :</strong> ${r.alertes_importantes.join(' — ')}</div>` : ''}

            <table style="width:100%;border-collapse:collapse;">

                ${section('💊 Médicament')}
                ${row('', 'Nom commercial', r.medicament?.nom_commercial)}
                ${row('', 'Nom générique',  r.medicament?.nom)}
                ${row('', 'Principe actif', lst(r.medicament?.principe_actif))}
                ${row('', 'Classe',         r.medicament?.classe_therapeutique)}
                ${row('', 'Forme',          r.medicament?.forme)}
                ${row('', 'Dosage',         r.medicament?.dosage)}
                ${row('', 'Fabricant',      r.medicament?.fabricant)}
                ${row('', 'Pays',           r.medicament?.pays)}

                ${section('🕐 Horaires & Posologie')}
                ${h.length ? row('', 'Horaires confirmés', `<strong>${h.join(', ')}</strong>`) : ''}
                ${row('', 'Heures notice',    lst(r.horaires?.heures_suggeres_notice))}
                ${row('', 'Fréquence/jour',   r.horaires?.frequence_par_jour ? r.horaires.frequence_par_jour + 'x' : '')}
                ${row('', 'Intervalle',       r.horaires?.intervalle_heures ? r.horaires.intervalle_heures + 'h' : '')}
                ${row('', 'Dose par prise',   r.horaires?.dose_par_prise)}
                ${r.horaires?.matin ? row('', 'Matin',  '✅') : ''}
                ${r.horaires?.midi  ? row('', 'Midi',   '✅') : ''}
                ${r.horaires?.soir  ? row('', 'Soir',   '✅') : ''}

                ${section('📋 Utilisation')}
                ${row('', 'Indications',      lst(r.utilisation?.indications))}
                ${row('', 'Mode admin.',      r.utilisation?.mode_administration)}
                ${row('', 'Dose recommandée', r.utilisation?.dose_recommandee)}
                ${row('', 'Fréquence',        r.utilisation?.frequence)}
                ${row('', 'Durée traitement', r.utilisation?.duree_traitement)}
                ${row('', 'Avant repas',      yn(r.utilisation?.avant_repas))}
                ${row('', 'Après repas',      yn(r.utilisation?.apres_repas))}
                ${row('', 'Avec eau',         yn(r.utilisation?.avec_eau))}
                ${row('', 'Oubli de dose',    r.oubli_dose)}

                ${(r.contre_indications||[]).length ? `
                ${section('🚫 Contre-indications')}
                <tr><td colspan="2" style="padding:4px 0;color:#b45309;">
                    ${r.contre_indications.map(c=>`<div>• ${c}</div>`).join('')}
                </td></tr>` : ''}

                ${(r.precautions||[]).length ? `
                ${section('⚠️ Précautions')}
                <tr><td colspan="2" style="padding:4px 0;color:#92400e;">
                    ${r.precautions.map(p=>`<div>• ${p}</div>`).join('')}
                </td></tr>` : ''}

                ${((r.effets_secondaires?.courants||[]).length || (r.effets_secondaires?.graves||[]).length) ? `
                ${section('😣 Effets secondaires')}
                ${(r.effets_secondaires?.courants||[]).length ? row('', 'Courants', lst(r.effets_secondaires.courants)) : ''}
                ${(r.effets_secondaires?.graves||[]).length  ? `<tr><td style="padding:4px 8px 4px 0;color:#6b7280;">Graves</td>
                    <td style="color:#dc2626;font-weight:500;">${lst(r.effets_secondaires.graves)}</td></tr>` : ''}
                ` : ''}

                ${section('🔗 Interactions')}
                ${row('', 'Médicaments', lst(r.interactions?.medicaments))}
                ${row('', 'Aliments',    lst(r.interactions?.aliments))}
                ${r.interactions?.alcool ? row('', 'Alcool', '⚠️ Déconseillé') : ''}

                ${section('👥 Populations spéciales')}
                ${row('', 'Grossesse',        r.population_speciale?.grossesse)}
                ${row('', 'Allaitement',      r.population_speciale?.allaitement)}
                ${row('', 'Enfants',          r.population_speciale?.enfants)}
                ${row('', 'Personnes âgées',  r.population_speciale?.personnes_agees)}
                ${row('', 'Insuf. rénale',    r.population_speciale?.insuffisance_renale)}
                ${row('', 'Insuf. hépatique', r.population_speciale?.insuffisance_hepatique)}

                ${section('🆘 Surdosage')}
                ${row('', 'Symptômes',   lst(r.surdosage?.symptomes))}
                ${row('', 'Action urgence', r.surdosage?.action_urgence)}

                ${section('🌡️ Conservation')}
                ${row('', 'Température', r.conservation?.temperature)}
                ${row('', 'Protéger lumière',  yn(r.conservation?.lumiere))}
                ${row('', 'Protéger humidité', yn(r.conservation?.humidite))}

                ${(r.ia?.champs_manquants||[]).length ? `
                ${section('🤖 IA — Champs non trouvés')}
                <tr><td colspan="2" style="padding:4px 0;color:#9ca3af;font-style:italic;">
                    ${r.ia.champs_manquants.join(', ')}
                </td></tr>` : ''}

            </table>

            <div style="margin-top:12px;padding:8px 12px;background:#fffbeb;border-radius:8px;
                font-size:11px;color:#92400e;text-align:center;">
                💾 Remplissez le formulaire ci-dessous puis cliquez sur
                <strong>Sauvegarder Port ${port}</strong> pour générer le JSON complet.
            </div>`;
    }

    return resultat;
}

// -----------------------------------------------
// FALLBACK LOCAL : Extraction regex sans API
// -----------------------------------------------
function extractSchedulesWithIA(port) {
    const pc         = getPortConfig();
    const noticeText = pc[port]?.noticeText || '';
    if (!noticeText) return false;

    const text = noticeText.toLowerCase();
    let foundTimes = [];

    const m1 = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g);
    if (m1) foundTimes.push(...m1);

    const pat2 = /(\d{1,2})h(?:\s*(\d{2}))?/g;
    let m2;
    while ((m2 = pat2.exec(text)) !== null) {
        const h = parseInt(m2[1]), min = m2[2] ? parseInt(m2[2]) : 0;
        if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
            const t = `${h.toString().padStart(2,'0')}:${min.toString().padStart(2,'0')}`;
            if (!foundTimes.includes(t)) foundTimes.push(t);
        }
    }

    const knownMeds = {
        'amlodipine':'Amlodipine','metformine':'Metformine','paracetamol':'Paracétamol',
        'ibuprofene':'Ibuprofène','omeprazole':'Oméprazole','tramadol':'Tramadol'
    };
    let foundMed = null;
    for (const [k, v] of Object.entries(knownMeds)) {
        if (text.includes(k)) { foundMed = v; break; }
    }

    if (foundTimes.length > 0) {
        const heures = [...new Set(foundTimes)].sort();
        pc[port].horaires = heures;
        if (window.schedules) window.schedules[port] = heures;
        if (typeof renderSchedules === 'function') renderSchedules(port);
    }
    if (foundMed) {
        pc[port].medicament = foundMed;
        const inp = document.getElementById(`med${port}`);
        if (inp) inp.value = foundMed;
    }

    if (foundTimes.length || foundMed) { savePortConfig(port); return true; }
    return false;
}

// -----------------------------------------------
// HELPER : Normaliser un horaire en "HH:MM"
// -----------------------------------------------
function normaliserHoraire(str) {
    if (!str) return null;
    const s = String(str).trim();
    if (/^\d{2}:\d{2}$/.test(s)) return s;
    const col = s.match(/^(\d{1,2}):(\d{2})$/);
    if (col) return col[1].padStart(2,'0') + ':' + col[2];
    const h = s.match(/^(\d{1,2})h(\d{0,2})$/i);
    if (h) {
        const hr = parseInt(h[1]), mn = h[2] ? parseInt(h[2]) : 0;
        if (hr >= 0 && hr <= 23 && mn >= 0 && mn <= 59)
            return hr.toString().padStart(2,'0') + ':' + mn.toString().padStart(2,'0');
    }
    return null;
}

// -----------------------------------------------
// SCAN Caméra
// -----------------------------------------------
async function startScan(port) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:10000;background:#000';

        const captureBtn = document.createElement('button');
        captureBtn.innerHTML = '📷 PRENDRE PHOTO';
        captureBtn.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:10001;padding:14px 28px;background:#1e6f3f;color:white;border:none;border-radius:40px;font-weight:bold;font-size:16px;cursor:pointer';

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '❌ ANNULER';
        closeBtn.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10001;padding:10px 20px;background:#e74c3c;color:white;border:none;border-radius:40px;cursor:pointer';

        document.body.appendChild(video);
        document.body.appendChild(captureBtn);
        document.body.appendChild(closeBtn);
        await video.play();

        const stopCam = () => stream.getTracks().forEach(t => t.stop());

        captureBtn.onclick = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            stopCam(); video.remove(); captureBtn.remove(); closeBtn.remove();
            await lancerOCR(canvas, port);
        };
        closeBtn.onclick = () => { stopCam(); video.remove(); captureBtn.remove(); closeBtn.remove(); };

    } catch(e) { alert('❌ Impossible d\'accéder à la caméra : ' + e.message); }
}

// -----------------------------------------------
// OCR : Tesseract → Groq
// -----------------------------------------------
async function lancerOCR(canvas, port) {
    const noticeDiv = document.getElementById(`noticeResult${port}`);
    if (noticeDiv) { noticeDiv.innerHTML = '🔍 OCR en cours...'; noticeDiv.style.background = '#f0f9ff'; }

    try {
        const MAX = 1500;
        let ocrCanvas = canvas;
        if (canvas.width > MAX || canvas.height > MAX) {
            const ratio = Math.min(MAX / canvas.width, MAX / canvas.height);
            ocrCanvas = document.createElement('canvas');
            ocrCanvas.width  = Math.round(canvas.width  * ratio);
            ocrCanvas.height = Math.round(canvas.height * ratio);
            ocrCanvas.getContext('2d').drawImage(canvas, 0, 0, ocrCanvas.width, ocrCanvas.height);
        }

        const { data: { text } } = await Tesseract.recognize(ocrCanvas, 'fra', { logger: m => console.log('[Tesseract]', m) });
        const cleanText = sanitizeText(text);

        if (!cleanText || cleanText.length < 10) {
            if (noticeDiv) { noticeDiv.innerHTML = '⚠️ Aucun texte détecté. Réessayez.'; noticeDiv.style.background = '#fee2e2'; }
            return;
        }
        await analyserNoticeAvecGroq(port, cleanText);

    } catch(e) {
        console.error('OCR Error:', e);
        if (noticeDiv) { noticeDiv.innerHTML = '❌ Erreur OCR. Utilisez Upload.'; noticeDiv.style.background = '#fee2e2'; }
    }
}

// -----------------------------------------------
// UPLOAD : image → OCR → Groq  |  .txt → Groq direct
// -----------------------------------------------
async function uploadNotice(port) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*,text/plain';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const noticeDiv = document.getElementById(`noticeResult${port}`);
        if (noticeDiv) { noticeDiv.innerHTML = `📁 Lecture de "${file.name}"...`; noticeDiv.style.background = '#f0f9ff'; }
        try {
            if (file.type === 'text/plain') {
                await analyserNoticeAvecGroq(port, await file.text());
            } else if (file.type.startsWith('image/')) {
                await lancerOCR(await imageFileToCanvas(file), port);
            } else { alert('⚠️ Format non supporté.'); }
        } catch(err) { if (noticeDiv) noticeDiv.innerHTML = `❌ Erreur : ${err.message}`; }
    };
    input.click();
}

function imageFileToCanvas(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width; canvas.height = img.height;
                canvas.getContext('2d').drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function sanitizeText(text) {
    if (!text) return '';
    return text.replace(/[^\w\s\u00C0-\u024F\u0600-\u06FF.,;:!?()\-/°%]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

// -----------------------------------------------
// HOOK fileInput pour les boutons Upload du HTML
// -----------------------------------------------
function attachUploadEvents() {
    ['A', 'B'].forEach(port => {
        const input = document.getElementById(`fileInput${port}`);
        if (!input) return;
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const noticeDiv = document.getElementById(`noticeResult${port}`);
            if (noticeDiv) { noticeDiv.innerHTML = `📁 Lecture de "${file.name}"...`; noticeDiv.style.background = '#f0f9ff'; }
            try {
                if (file.type === 'text/plain') {
                    await analyserNoticeAvecGroq(port, await file.text());
                } else if (file.type.startsWith('image/')) {
                    await lancerOCR(await imageFileToCanvas(file), port);
                } else { alert('⚠️ Format non supporté.'); }
            } catch(err) { if (noticeDiv) noticeDiv.innerHTML = `❌ Erreur : ${err.message}`; }
        };
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachUploadEvents);
} else {
    attachUploadEvents();
}

// -----------------------------------------------
// Exports globaux
// -----------------------------------------------
window.getPortConfig          = getPortConfig;
window.savePortConfig         = savePortConfig;
window.creerPortVide          = creerPortVide;
window.extraireInfosGroq      = extraireInfosGroq;
window.normaliserHoraire      = normaliserHoraire;
window.analyserNoticeAvecGroq = analyserNoticeAvecGroq;
window.fusionnerAvecConfig    = fusionnerAvecConfig;
window.sauvegarderEtEnvoyer   = sauvegarderEtEnvoyer;
window.telechargerJSON        = telechargerJSON;
window.afficherBoutonJSON     = afficherBoutonJSON;
window.extractSchedulesWithIA = extractSchedulesWithIA;
window.startScan              = startScan;
window.lancerOCR              = lancerOCR;
window.uploadNotice           = uploadNotice;
window.sanitizeText           = sanitizeText;