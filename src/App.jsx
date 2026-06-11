import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";

// ============================================================
//  CONFIGURATION SUPABASE
// ============================================================
const SUPABASE_URL = "https://pddfgcxmlnmqxbufthpz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZGZnY3htbG5tcXhidWZ0aHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzIyNTcsImV4cCI6MjA5NjM0ODI1N30.L4DH5q38KaZdi4KfxRfzoT4fC-REGw-PkN4j8JGeUpk";

const H = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};
const api = (chemin) => `${SUPABASE_URL}/rest/v1/${chemin}`;

async function hacher(motDePasse) {
  const data = new TextEncoder().encode(motDePasse);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------------
//  KaTeX
// ------------------------------------------------------------
function useKatex() {
  const [pret, setPret] = useState(!!window.katex);
  useEffect(() => {
    if (window.katex) { setPret(true); return; }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js";
    js.onload = () => setPret(true);
    document.head.appendChild(js);
  }, []);
  return pret;
}

// Nettoie le HTML et la syntaxe LaTeX d'Anki pour les ramener au format $...$
function nettoyerAnki(texte) {
  if (!texte) return "";
  let t = texte;
  // Syntaxe LaTeX d'Anki -> $...$
  t = t.replace(/\[latex\]([\s\S]*?)\[\/latex\]/g, (_, m) => "$" + m.trim() + "$");
  t = t.replace(/\[\$\$\]([\s\S]*?)\[\/\$\$\]/g, (_, m) => "$$" + m.trim() + "$$");
  t = t.replace(/\[\$\]([\s\S]*?)\[\/\$\]/g, (_, m) => "$" + m.trim() + "$");
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => "$" + m.trim() + "$");
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => "$$" + m.trim() + "$$");
  // Images Anki non disponibles -> petit marqueur
  t = t.replace(/<img[^>]*>/gi, " [image non disponible] ");
  // Sauts de ligne HTML -> espace (le rendu gère deja les vrais \n)
  t = t.replace(/<br\s*\/?>/gi, " ");
  t = t.replace(/<\/(div|p|li)>/gi, " ");
  // Retirer toutes les autres balises HTML, en gardant leur contenu texte
  t = t.replace(/<[^>]+>/g, "");
  // Decoder les entites HTML courantes
  const ent = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&rsquo;": "\u2019" };
  t = t.replace(/&[a-zA-Z#0-9]+;/g, (e) => ent[e] !== undefined ? ent[e] : e);
  // Espaces multiples
  t = t.replace(/[ \t]{2,}/g, " ").trim();
  return t;
}

function rendreLatex(texte, katexPret) {
  if (!texte) return "";
  texte = nettoyerAnki(texte);
  texte = texte.replace(/\\n/g, "\n");
  if (!katexPret || !window.katex) return texte;
  const morceaux = [];
  const regex = /(\$\$[^$]+\$\$|\$[^$]+\$)/g;
  let dernier = 0, m;
  while ((m = regex.exec(texte)) !== null) {
    if (m.index > dernier) morceaux.push({ t: texte.slice(dernier, m.index), math: false });
    const brut = m[0];
    const display = brut.startsWith("$$");
    const contenu = brut.replace(/^\$\$?|\$\$?$/g, "");
    morceaux.push({ t: contenu, math: true, display });
    dernier = m.index + brut.length;
  }
  if (dernier < texte.length) morceaux.push({ t: texte.slice(dernier), math: false });
  return morceaux.map((p) => {
    if (!p.math) return p.t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>");
    try { return window.katex.renderToString(p.t, { displayMode: p.display, throwOnError: false }); }
    catch { return p.t; }
  }).join("");
}

function Latex({ children, katexPret }) {
  const html = useMemo(() => rendreLatex(children, katexPret), [children, katexPret]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function couleurElo(e) { return e < 1100 ? "#3a7d44" : e < 1400 ? "#caa43a" : e < 1700 ? "#c8762f" : "#b3402f"; }
function labelElo(e) { return e < 1100 ? "Application" : e < 1400 ? "Entraînement" : e < 1700 ? "Concours" : "X-ENS"; }

// ============================================================
//  MULTI-SELECT AVEC RECHERCHE
// ============================================================
function MultiSelect({ titre, options, selection, onChange, placeholder }) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    function clicDehors(e) { if (ref.current && !ref.current.contains(e.target)) setOuvert(false); }
    document.addEventListener("mousedown", clicDehors);
    return () => document.removeEventListener("mousedown", clicDehors);
  }, []);
  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, recherche]);
  function toggle(value) {
    const next = new Set(selection);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange(next);
  }
  const resume = selection.size === 0 ? (placeholder || "Tous")
    : selection.size === 1 ? (options.find((o) => selection.has(o.value))?.label || "1 choisi")
    : `${selection.size} sélectionnés`;
  return (
    <div className="champ" ref={ref}>
      <label>{titre}</label>
      <div className="ms">
        <button type="button" className="ms-resume" onClick={() => setOuvert(!ouvert)}>
          <span>{resume}</span><span className="ms-fleche">{ouvert ? "▴" : "▾"}</span>
        </button>
        {ouvert && (
          <div className="ms-panneau">
            <input className="ms-search" autoFocus value={recherche}
                   onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher…" />
            <div className="ms-actions">
              <button type="button" onClick={() => onChange(new Set())}>Tout désélectionner</button>
            </div>
            <div className="ms-liste">
              {filtrees.length === 0 && <div className="ms-vide">Aucun résultat</div>}
              {filtrees.map((o) => (
                <label key={o.value} className="ms-item">
                  <input type="checkbox" checked={selection.has(o.value)} onChange={() => toggle(o.value)} />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
//  CONNEXION
// ============================================================
function Connexion({ onConnecte }) {
  const [profils, setProfils] = useState([]);
  const [mode, setMode] = useState("choisir");
  const [pseudo, setPseudo] = useState("");
  const [mdp, setMdp] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    fetch(api("profils?select=id,pseudo"), { headers: H })
      .then((r) => r.json()).then((d) => setProfils(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  async function seConnecter() {
    setMsg("");
    const r = await fetch(api(`profils?pseudo=eq.${encodeURIComponent(pseudo)}&select=*`), { headers: H });
    const data = await r.json();
    if (!data.length) { setMsg("Pseudo inconnu."); return; }
    const empreinte = await hacher(mdp);
    if (data[0].mot_de_passe !== empreinte) { setMsg("Mot de passe incorrect."); return; }
    onConnecte(data[0]);
  }
  async function creer() {
    setMsg("");
    if (!pseudo.trim() || !mdp.trim()) { setMsg("Pseudo et mot de passe requis."); return; }
    const r = await fetch(api("profils"), {
      method: "POST", headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ pseudo: pseudo.trim(), mot_de_passe: await hacher(mdp) }),
    });
    if (r.status === 409) { setMsg("Ce pseudo existe déjà."); return; }
    if (!r.ok) { setMsg("Erreur à la création."); return; }
    const data = await r.json();
    onConnecte(data[0]);
  }
  return (
    <div className="connexion">
      <h1>Banque d'exercices</h1>
      <p className="sous-titre">Prépa MPSI · MP</p>
      <div className="onglets-co">
        <button className={mode === "choisir" ? "actif" : ""} onClick={() => setMode("choisir")}>Se connecter</button>
        <button className={mode === "creer" ? "actif" : ""} onClick={() => setMode("creer")}>Créer un profil</button>
      </div>
      {mode === "choisir" && profils.length > 0 && (
        <div className="champ">
          <label>Profils existants</label>
          <select onChange={(e) => setPseudo(e.target.value)} value={pseudo}>
            <option value="">— choisir —</option>
            {profils.map((p) => <option key={p.id} value={p.pseudo}>{p.pseudo}</option>)}
          </select>
        </div>
      )}
      {mode === "creer" && (
        <div className="champ">
          <label>Nouveau pseudo</label>
          <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="ton pseudo" />
        </div>
      )}
      <div className="champ">
        <label>Mot de passe</label>
        <input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} placeholder="••••••" />
      </div>
      <button className="btn-principal" onClick={mode === "creer" ? creer : seConnecter}>
        {mode === "creer" ? "Créer et entrer" : "Entrer"}
      </button>
      {msg && <div className="msg-co">{msg}</div>}
      <p className="avert-co">Mot de passe haché (SHA-256) — protection limitée, n'utilise pas un mot de passe sensible.</p>
    </div>
  );
}

// ============================================================
//  CARTE EXERCICE
// ============================================================
function CarteExo({ exo, chapitresById, katexPret, onResultat, dejaFait, onSupprimer }) {
  const [ouvert, setOuvert] = useState(false);
  const chap = chapitresById[exo.chapitre_id];
  return (
    <article className="exo">
      <div className="exo-tete">
        <div className="exo-meta">
          {chap && <span className="badge-chap">{chap.filiere} · {chap.nom}</span>}
          {exo.source && <span className="exo-source">{exo.source}</span>}
        </div>
        <div className="exo-elo" style={{ "--c": couleurElo(exo.elo) }}>
          <span className="elo-pastille" /><span className="elo-num">{exo.elo}</span>
          <span className="elo-label">{labelElo(exo.elo)}</span>
        </div>
      </div>
      <div className="exo-enonce"><Latex katexPret={katexPret}>{exo.enonce}</Latex></div>
      {Array.isArray(exo.tags) && exo.tags.length > 0 && (
        <div className="exo-tags">{exo.tags.map((t, i) => <span key={i} className="tag">{t}</span>)}</div>
      )}
      {exo.correction && (
        <div className="exo-corr">
          <button className="corr-btn" onClick={() => setOuvert(!ouvert)}>
            {ouvert ? "▾ Masquer la correction" : "▸ Voir la correction"}
          </button>
          {ouvert && <div className="corr-contenu"><Latex katexPret={katexPret}>{exo.correction}</Latex></div>}
        </div>
      )}
      {onResultat && (
        <div className="exo-actions">
          {dejaFait ? (
            <span className="deja">Déjà tenté ({dejaFait === "reussi" ? "réussi" : "raté"})</span>
          ) : (
            <>
              <button className="btn-reussi" onClick={() => onResultat(exo, true)}>J'ai réussi</button>
              <button className="btn-rate" onClick={() => onResultat(exo, false)}>J'ai raté</button>
            </>
          )}
        </div>
      )}
      {onSupprimer && (
        <div className="exo-admin">
          <button className="btn-suppr" onClick={() => onSupprimer(exo)}>Supprimer cet exo</button>
        </div>
      )}
    </article>
  );
}

// ============================================================
//  SECTION COURS (flashcards, propres au profil)
// ============================================================
function SectionCours({ profil, katexPret }) {
  const [cartes, setCartes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [paquet, setPaquet] = useState("Tous");
  const [sousVue, setSousVue] = useState("liste"); // liste | reviser | importer

  // révision
  const [ordre, setOrdre] = useState([]);     // indices mélangés
  const [pos, setPos] = useState(0);
  const [retourne, setRetourne] = useState(false);

  // import
  const [nomPaquet, setNomPaquet] = useState("");
  const [separateur, setSeparateur] = useState(";");
  const [contenu, setContenu] = useState("");
  const [msgImport, setMsgImport] = useState("");

  const charger = useCallback(async () => {
    setChargement(true);
    const r = await fetch(api(`cartes?user_id=eq.${profil.id}&select=*`), { headers: H });
    const d = await r.json();
    setCartes(Array.isArray(d) ? d : []);
    setChargement(false);
  }, [profil.id]);

  useEffect(() => { charger(); }, [charger]);

  const paquets = useMemo(
    () => ["Tous", ...Array.from(new Set(cartes.map((c) => c.paquet || "Général"))).sort()],
    [cartes]
  );
  const cartesPaquet = useMemo(
    () => paquet === "Tous" ? cartes : cartes.filter((c) => (c.paquet || "Général") === paquet),
    [cartes, paquet]
  );

  function demarrerRevision() {
    const idx = cartesPaquet.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { // mélange
      const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    setOrdre(idx); setPos(0); setRetourne(false); setSousVue("reviser");
  }

  async function importer() {
    setMsgImport("");
    const lignes = contenu.split("\n").map((l) => l.trim()).filter(Boolean);
    const nouvelles = [];
    for (const ligne of lignes) {
      const i = ligne.indexOf(separateur);
      if (i === -1) continue; // ligne sans séparateur ignorée
      const recto = ligne.slice(0, i).trim();
      const verso = ligne.slice(i + 1).trim();
      if (recto && verso) nouvelles.push({
        user_id: profil.id, recto, verso, paquet: (nomPaquet.trim() || "Général"),
      });
    }
    if (!nouvelles.length) { setMsgImport("Aucune carte valide détectée. Vérifie le séparateur."); return; }
    const r = await fetch(api("cartes"), {
      method: "POST", headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify(nouvelles),
    });
    if (r.ok) {
      setMsgImport(`${nouvelles.length} carte(s) importée(s).`);
      setContenu(""); setNomPaquet("");
      charger();
    } else { setMsgImport("Erreur à l'import (vérifie que la table 'cartes' existe)."); }
  }

  async function supprimerPaquet(nom) {
    if (!window.confirm(`Supprimer toutes les cartes du paquet « ${nom} » ?`)) return;
    await fetch(api(`cartes?user_id=eq.${profil.id}&paquet=eq.${encodeURIComponent(nom)}`), {
      method: "DELETE", headers: { ...H, Prefer: "return=minimal" },
    });
    charger();
  }

  if (chargement) return <div className="info">Chargement des cartes…</div>;

  return (
    <section className="cours">
      <div className="cours-onglets">
        <button className={sousVue === "liste" ? "actif" : ""} onClick={() => setSousVue("liste")}>Mes paquets</button>
        <button className={sousVue === "importer" ? "actif" : ""} onClick={() => setSousVue("importer")}>Importer</button>
      </div>

      {sousVue === "liste" && (
        <>
          {cartes.length === 0 ? (
            <div className="info">Aucune carte. Va dans « Importer » pour ajouter tes cartes Anki (export texte).</div>
          ) : (
            <>
              <div className="barre-filtres">
                <div className="champ">
                  <label>Paquet</label>
                  <select value={paquet} onChange={(e) => setPaquet(e.target.value)}>
                    {paquets.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <button className="btn-tirer" onClick={demarrerRevision} disabled={!cartesPaquet.length}>
                  Réviser ({cartesPaquet.length}) →
                </button>
                {paquet !== "Tous" && (
                  <button className="btn-suppr" onClick={() => supprimerPaquet(paquet)}>Supprimer ce paquet</button>
                )}
              </div>
              <div className="cartes-grille">
                {cartesPaquet.map((c) => (
                  <div key={c.id} className="mini-carte">
                    <div className="mini-recto"><Latex katexPret={katexPret}>{c.recto}</Latex></div>
                    <div className="mini-verso"><Latex katexPret={katexPret}>{c.verso}</Latex></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {sousVue === "reviser" && (
        <div className="revision">
          {ordre.length === 0 ? (
            <div className="info">Paquet vide.</div>
          ) : pos >= ordre.length ? (
            <div className="revision-fin">
              <p>Révision terminée — {ordre.length} carte(s).</p>
              <button className="btn-tirer" onClick={() => setSousVue("liste")}>Retour aux paquets</button>
            </div>
          ) : (
            <>
              <div className="revision-compteur">{pos + 1} / {ordre.length}</div>
              <div className="flashcard" onClick={() => setRetourne(!retourne)}>
                <div className="flashcard-face">
                  <span className="flashcard-label">{retourne ? "Verso" : "Recto"}</span>
                  <div className="flashcard-contenu">
                    <Latex katexPret={katexPret}>
                      {retourne ? cartesPaquet[ordre[pos]].verso : cartesPaquet[ordre[pos]].recto}
                    </Latex>
                  </div>
                  {!retourne && <div className="flashcard-aide">Clique pour retourner</div>}
                </div>
              </div>
              <div className="revision-actions">
                {retourne ? (
                  <button className="btn-tirer" onClick={() => { setPos(pos + 1); setRetourne(false); }}>
                    Carte suivante →
                  </button>
                ) : (
                  <button className="btn-tirer" onClick={() => setRetourne(true)}>Voir la réponse</button>
                )}
                <button className="btn-deco" onClick={() => setSousVue("liste")}>Arrêter</button>
              </div>
            </>
          )}
        </div>
      )}

      {sousVue === "importer" && (
        <div className="import">
          <p className="import-aide">
            Dans Anki : <em>Fichier → Exporter → Notes en texte brut</em>. Ouvre le fichier, copie son
            contenu et colle-le ci-dessous. Une carte par ligne, recto et verso séparés par le séparateur choisi.
          </p>
          <div className="barre-filtres">
            <div className="champ">
              <label>Nom du paquet</label>
              <input value={nomPaquet} onChange={(e) => setNomPaquet(e.target.value)} placeholder="ex. Analyse MP" />
            </div>
            <div className="champ">
              <label>Séparateur</label>
              <select value={separateur} onChange={(e) => setSeparateur(e.target.value)}>
                <option value=";">point-virgule ;</option>
                <option value={"\t"}>tabulation</option>
                <option value=",">virgule ,</option>
                <option value="|">barre |</option>
              </select>
            </div>
          </div>
          <textarea className="import-zone" rows={10} value={contenu}
                    onChange={(e) => setContenu(e.target.value)}
                    placeholder={"recto 1;verso 1\nrecto 2;verso 2"} />
          <div className="import-bas">
            <button className="btn-tirer" onClick={importer}>Importer les cartes</button>
            {msgImport && <span className="import-msg">{msgImport}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================
//  GENERATEUR DE DS (page imprimable)
// ============================================================
function melange(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function GenerateurDS({ profil, exos, chapitres, chapitresById, optionsChapitres, optionsSources, katexPret }) {
  const [cartes, setCartes] = useState([]);
  const [nbCours, setNbCours] = useState(5);
  const [nbExos, setNbExos] = useState(3);
  const [paquetsSel, setPaquetsSel] = useState(new Set());
  const [chapSel, setChapSel] = useState(new Set());
  const [srcSel, setSrcSel] = useState(new Set());
  const [titre, setTitre] = useState("Devoir surveillé");
  const [ds, setDs] = useState(null); // { cours:[], exos:[] }

  useEffect(() => {
    fetch(api(`cartes?user_id=eq.${profil.id}&select=*`), { headers: H })
      .then((r) => r.json()).then((d) => setCartes(Array.isArray(d) ? d : [])).catch(() => {});
  }, [profil.id]);

  const optionsPaquets = useMemo(() => {
    const set = new Set(cartes.map((c) => c.paquet || "Général"));
    return Array.from(set).sort().map((p) => ({ value: p, label: p }));
  }, [cartes]);

  function generer() {
    // questions de cours = cartes des paquets choisis
    let poolCours = cartes;
    if (paquetsSel.size > 0) poolCours = poolCours.filter((c) => paquetsSel.has(c.paquet || "Général"));
    const cours = melange(poolCours).slice(0, nbCours);
    // exos selon chapitres + sources
    let poolExos = exos;
    if (chapSel.size > 0) poolExos = poolExos.filter((x) => chapSel.has(x.chapitre_id));
    if (srcSel.size > 0) poolExos = poolExos.filter((x) => srcSel.has(x.source));
    const exosTires = melange(poolExos).slice(0, nbExos);
    setDs({ cours, exos: exosTires });
  }

  function imprimer() { window.print(); }

  return (
    <section className="ds">
      <div className="ds-reglages no-print">
        <div className="barre-filtres">
          <div className="champ">
            <label>Titre du DS</label>
            <input value={titre} onChange={(e) => setTitre(e.target.value)} />
          </div>
          <div className="champ">
            <label>Nb questions de cours</label>
            <input type="number" min="0" value={nbCours} onChange={(e) => setNbCours(Math.max(0, +e.target.value))} />
          </div>
          <div className="champ">
            <label>Nb exercices</label>
            <input type="number" min="0" value={nbExos} onChange={(e) => setNbExos(Math.max(0, +e.target.value))} />
          </div>
        </div>
        <div className="barre-filtres">
          <MultiSelect titre="Paquets (cours)" options={optionsPaquets}
                       selection={paquetsSel} onChange={setPaquetsSel} placeholder="Tous les paquets" />
          <MultiSelect titre="Chapitres (exos)" options={optionsChapitres}
                       selection={chapSel} onChange={setChapSel} placeholder="Tous les chapitres" />
          <MultiSelect titre="Sources (exos)" options={optionsSources}
                       selection={srcSel} onChange={setSrcSel} placeholder="Toutes les sources" />
          <button className="btn-tirer" onClick={generer}>
            {ds ? "Relancer le tirage" : "Générer le DS"}
          </button>
          {ds && <button className="btn-principal btn-imprimer" onClick={imprimer}>Imprimer / PDF</button>}
        </div>
        {ds && (ds.cours.length < nbCours || ds.exos.length < nbExos) && (
          <p className="ds-avert">Attention : pas assez de cartes/exos dans la sélection pour atteindre les nombres demandés ({ds.cours.length} cours, {ds.exos.length} exos disponibles).</p>
        )}
      </div>

      {ds && (
        <div className="ds-feuille">
          <div className="ds-entete">
            <h2>{titre}</h2>
            <div className="ds-ligne-nom">Nom : ............................................  Durée : ............</div>
          </div>

          {ds.cours.length > 0 && (
            <div className="ds-partie">
              <h3>Questions de cours</h3>
              <ol className="ds-ol">
                {ds.cours.map((c) => (
                  <li key={c.id} className="ds-item">
                    <Latex katexPret={katexPret}>{c.recto}</Latex>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {ds.exos.length > 0 && (
            <div className="ds-partie">
              <h3>Exercices</h3>
              <ol className="ds-ol">
                {ds.exos.map((x) => {
                  const chap = chapitresById[x.chapitre_id];
                  return (
                    <li key={x.id} className="ds-item ds-exo">
                      <div className="ds-exo-meta">
                        {chap && <span>{chap.nom}</span>}{x.source && <span> · {x.source}</span>}
                      </div>
                      <Latex katexPret={katexPret}>{x.enonce}</Latex>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* Corrigé en fin de document, sur nouvelle page */}
          <div className="ds-corrige">
            <h2 className="ds-saut-page">Corrigé</h2>
            {ds.cours.length > 0 && (
              <div className="ds-partie">
                <h3>Questions de cours</h3>
                <ol className="ds-ol">
                  {ds.cours.map((c) => (
                    <li key={c.id} className="ds-item">
                      <div className="ds-q"><Latex katexPret={katexPret}>{c.recto}</Latex></div>
                      <div className="ds-r"><Latex katexPret={katexPret}>{c.verso}</Latex></div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {ds.exos.length > 0 && (
              <div className="ds-partie">
                <h3>Exercices</h3>
                <ol className="ds-ol">
                  {ds.exos.map((x) => (
                    <li key={x.id} className="ds-item">
                      {x.correction ? <Latex katexPret={katexPret}>{x.correction}</Latex>
                        : <span className="ds-pas-corr">Pas de correction disponible pour cet exercice.</span>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================
//  APP
// ============================================================
export default function App() {
  const katexPret = useKatex();
  const [profil, setProfil] = useState(null);
  const [exos, setExos] = useState([]);
  const [chapitres, setChapitres] = useState([]);
  const [tentatives, setTentatives] = useState([]);
  const [vue, setVue] = useState("entrainement");
  const [chargement, setChargement] = useState(false);

  const [chapEntr, setChapEntr] = useState(new Set());
  const [srcEntr, setSrcEntr] = useState(new Set());
  const [chapListe, setChapListe] = useState(new Set());
  const [srcListe, setSrcListe] = useState(new Set());
  const [tri, setTri] = useState("elo_asc");
  const [exoCourant, setExoCourant] = useState(null);

  const chargerDonnees = useCallback(async (prof) => {
    setChargement(true);
    try {
      const [rE, rC, rT] = await Promise.all([
        fetch(api("exercices?select=*"), { headers: H }),
        fetch(api("chapitres?select=*"), { headers: H }),
        fetch(api(`tentatives?user_id=eq.${prof.id}&select=exercice_id,reussi`), { headers: H }),
      ]);
      const safe = async (r) => { const d = await r.json(); return Array.isArray(d) ? d : []; };
      setExos(await safe(rE)); setChapitres(await safe(rC)); setTentatives(await safe(rT));
    } catch (e) { setExos([]); setChapitres([]); setTentatives([]); }
    finally { setChargement(false); }
  }, []);

  useEffect(() => { if (profil) chargerDonnees(profil); }, [profil, chargerDonnees]);

  const chapitresById = useMemo(() => {
    const o = {}; chapitres.forEach((c) => (o[c.id] = c)); return o;
  }, [chapitres]);

  const optionsChapitres = useMemo(
    () => [...chapitres].sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
      .map((c) => ({ value: c.id, label: `${c.filiere} · ${c.nom}` })),
    [chapitres]
  );
  const optionsSources = useMemo(() => {
    const set = new Set(exos.map((x) => x.source).filter(Boolean));
    return Array.from(set).sort().map((s) => ({ value: s, label: s }));
  }, [exos]);

  const faitsParExo = useMemo(() => {
    const o = {}; tentatives.forEach((t) => { o[t.exercice_id] = t.reussi ? "reussi" : "rate"; });
    return o;
  }, [tentatives]);

  const filtrer = useCallback((liste, chapSet, srcSet) => {
    let xs = liste;
    if (chapSet.size > 0) xs = xs.filter((x) => chapSet.has(x.chapitre_id));
    if (srcSet.size > 0) xs = xs.filter((x) => srcSet.has(x.source));
    return xs;
  }, []);

  const tirerExo = useCallback(() => {
    let pool = exos.filter((x) => !faitsParExo[x.id]);
    pool = filtrer(pool, chapEntr, srcEntr);
    if (!pool.length) { setExoCourant(null); return; }
    setExoCourant(pool[Math.floor(Math.random() * pool.length)]);
  }, [exos, faitsParExo, chapEntr, srcEntr, filtrer]);

  useEffect(() => {
    if (vue === "entrainement" && !exoCourant && exos.length) tirerExo();
  }, [vue, exos, exoCourant, tirerExo]);

  async function enregistrer(exo, reussi) {
    await fetch(api("tentatives"), {
      method: "POST", headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: profil.id, exercice_id: exo.id, reussi }),
    });
    setTentatives((prev) => [...prev, { exercice_id: exo.id, reussi }]);
    setExoCourant(null);
  }

  async function supprimerExo(exo) {
    if (!window.confirm(`Supprimer définitivement cet exercice ?\n\n${(exo.enonce || "").slice(0, 80)}…`)) return;
    const r = await fetch(api(`exercices?id=eq.${exo.id}`), { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
    if (r.ok) {
      setExos((prev) => prev.filter((x) => x.id !== exo.id));
      if (exoCourant?.id === exo.id) setExoCourant(null);
    } else { alert("Échec de la suppression (vérifie la policy DELETE)."); }
  }

  const exosListe = useMemo(() => {
    let xs = filtrer([...exos], chapListe, srcListe);
    xs.sort((a, b) => (tri === "elo_desc" ? b.elo - a.elo : a.elo - b.elo));
    return xs;
  }, [exos, chapListe, srcListe, tri, filtrer]);

  const stats = useMemo(() => ({
    total: exos.length, faits: tentatives.length, reussis: tentatives.filter((t) => t.reussi).length,
  }), [exos, tentatives]);

  const estAdmin = profil && profil.est_admin === true;

  if (!profil) return <div className="app"><style>{CSS}</style><Connexion onConnecte={setProfil} /></div>;

  return (
    <div className="app">
      <style>{CSS}</style>
      <header className="entete">
        <div className="entete-titre">
          <h1>Banque d'exercices</h1>
          <p className="sous-titre">
            Bonjour {profil.pseudo}{estAdmin ? " (admin)" : ""} — {stats.faits}/{stats.total} faits · {stats.reussis} réussis
          </p>
        </div>
        <button className="btn-deco" onClick={() => { setProfil(null); setExoCourant(null); }}>Changer de profil</button>
      </header>

      <nav className="onglets">
        <button className={vue === "entrainement" ? "actif" : ""} onClick={() => setVue("entrainement")}>Entraînement</button>
        <button className={vue === "liste" ? "actif" : ""} onClick={() => setVue("liste")}>Tous les exos</button>
        <button className={vue === "cours" ? "actif" : ""} onClick={() => setVue("cours")}>Cours</button>
        <button className={vue === "ds" ? "actif" : ""} onClick={() => setVue("ds")}>Générateur de DS</button>
      </nav>

      {chargement && vue !== "cours" && <div className="info">Chargement…</div>}

      {vue === "entrainement" && !chargement && (
        <section className="entrainement">
          <div className="barre-filtres">
            <MultiSelect titre="Chapitres" options={optionsChapitres}
                         selection={chapEntr} onChange={(s) => { setChapEntr(s); setExoCourant(null); }}
                         placeholder="Tous les chapitres" />
            <MultiSelect titre="Sources" options={optionsSources}
                         selection={srcEntr} onChange={(s) => { setSrcEntr(s); setExoCourant(null); }}
                         placeholder="Toutes les sources" />
            <button className="btn-tirer" onClick={tirerExo}>Autre exercice →</button>
          </div>
          {exoCourant ? (
            <CarteExo exo={exoCourant} chapitresById={chapitresById} katexPret={katexPret}
                      onResultat={enregistrer} dejaFait={null} onSupprimer={estAdmin ? supprimerExo : null} />
          ) : (
            <div className="info">Aucun exercice non tenté dans cette sélection. Élargis les filtres ou va dans « Tous les exos ».</div>
          )}
        </section>
      )}

      {vue === "liste" && !chargement && (
        <section>
          <div className="barre-filtres">
            <MultiSelect titre="Chapitres" options={optionsChapitres}
                         selection={chapListe} onChange={setChapListe} placeholder="Tous les chapitres" />
            <MultiSelect titre="Sources" options={optionsSources}
                         selection={srcListe} onChange={setSrcListe} placeholder="Toutes les sources" />
            <div className="champ">
              <label>Tri</label>
              <select value={tri} onChange={(e) => setTri(e.target.value)}>
                <option value="elo_asc">Elo croissant</option>
                <option value="elo_desc">Elo décroissant</option>
              </select>
            </div>
          </div>
          <div className="compte-liste">{exosListe.length} exercice(s)</div>
          <div className="liste">
            {exosListe.map((exo) => (
              <CarteExo key={exo.id} exo={exo} chapitresById={chapitresById} katexPret={katexPret}
                        onResultat={enregistrer} dejaFait={faitsParExo[exo.id]} onSupprimer={estAdmin ? supprimerExo : null} />
            ))}
          </div>
        </section>
      )}

      {vue === "cours" && <SectionCours profil={profil} katexPret={katexPret} />}

      {vue === "ds" && (
        <GenerateurDS profil={profil} exos={exos} chapitres={chapitres}
                      chapitresById={chapitresById} optionsChapitres={optionsChapitres}
                      optionsSources={optionsSources} katexPret={katexPret} />
      )}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Spline+Sans+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
.app {
  --encre:#1a1812; --papier:#f4f0e6; --papier-2:#ece6d8; --trait:#d4cdb8; --accent:#7d3a2f;
  --vert:#3a7d44; --rouge:#b3402f;
  min-height:100vh;
  background:radial-gradient(circle at 12% 8%, rgba(125,58,47,0.04), transparent 40%), var(--papier);
  color:var(--encre); font-family:'Newsreader',Georgia,serif;
  padding:2.2rem clamp(1rem,5vw,4rem);
}
h1 { font-family:'Fraunces',serif; font-weight:700; font-size:clamp(1.9rem,4vw,3rem); letter-spacing:-0.02em; line-height:1; }
.sous-titre { font-style:italic; color:#6b6453; margin-top:0.4rem; font-size:1.02rem; }
.connexion { max-width:380px; margin:8vh auto; display:flex; flex-direction:column; gap:1rem; }
.onglets-co, .cours-onglets { display:flex; gap:0.5rem; margin-top:1rem; }
.onglets-co button, .onglets button, .cours-onglets button {
  font-family:'Spline Sans Mono',monospace; font-size:0.8rem; padding:0.5rem 0.9rem;
  background:var(--papier-2); border:1px solid var(--trait); border-radius:2px; cursor:pointer; color:#6b6453;
}
.onglets-co button.actif, .onglets button.actif, .cours-onglets button.actif { background:var(--accent); color:#fff; border-color:var(--accent); }
.btn-principal { font-family:'Spline Sans Mono',monospace; font-size:0.9rem; padding:0.7rem; cursor:pointer; background:var(--accent); color:#fff; border:none; border-radius:2px; margin-top:0.5rem; }
.msg-co { color:var(--rouge); font-family:'Spline Sans Mono',monospace; font-size:0.82rem; }
.avert-co { font-size:0.78rem; color:#6b6453; font-style:italic; }
.entete { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid var(--encre); padding-bottom:1.1rem; }
.btn-deco { font-family:'Spline Sans Mono',monospace; font-size:0.78rem; background:none; border:1px solid var(--trait); padding:0.4rem 0.7rem; border-radius:2px; cursor:pointer; color:#6b6453; }
.onglets { display:flex; gap:0.5rem; margin:1.3rem 0; }
.cours-onglets { margin:1.3rem 0; }
.barre-filtres { display:flex; flex-wrap:wrap; gap:1rem; align-items:flex-end; padding-bottom:1.3rem; margin-bottom:1rem; border-bottom:1px solid var(--trait); }
.champ { display:flex; flex-direction:column; gap:0.3rem; position:relative; }
.champ label { font-family:'Spline Sans Mono',monospace; font-size:0.66rem; text-transform:uppercase; letter-spacing:0.15em; color:#6b6453; }
.champ select, .champ input { font-family:'Newsreader',serif; font-size:0.98rem; padding:0.5rem 0.7rem; border:1px solid var(--trait); background:var(--papier-2); color:var(--encre); border-radius:2px; min-width:150px; outline:none; }
.champ select:focus, .champ input:focus { border-color:var(--accent); }
.btn-tirer { font-family:'Spline Sans Mono',monospace; font-size:0.85rem; padding:0.55rem 1rem; background:var(--encre); color:var(--papier); border:none; border-radius:2px; cursor:pointer; height:fit-content; }
.btn-tirer:disabled { opacity:0.4; cursor:not-allowed; }
.ms { position:relative; }
.ms-resume { font-family:'Newsreader',serif; font-size:0.98rem; padding:0.5rem 0.7rem; border:1px solid var(--trait); background:var(--papier-2); color:var(--encre); border-radius:2px; min-width:200px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:0.5rem; }
.ms-fleche { color:#6b6453; font-size:0.75rem; }
.ms-panneau { position:absolute; top:calc(100% + 4px); left:0; z-index:30; width:min(320px,80vw); background:#fbf8f0; border:1px solid var(--trait); border-radius:3px; box-shadow:0 12px 30px -12px rgba(0,0,0,0.4); padding:0.6rem; }
.ms-search { width:100%; font-family:'Newsreader',serif; font-size:0.92rem; padding:0.45rem 0.6rem; border:1px solid var(--trait); background:var(--papier); border-radius:2px; outline:none; margin-bottom:0.4rem; }
.ms-search:focus { border-color:var(--accent); }
.ms-actions { margin-bottom:0.4rem; }
.ms-actions button { font-family:'Spline Sans Mono',monospace; font-size:0.7rem; background:none; border:none; color:var(--accent); cursor:pointer; padding:0; }
.ms-actions button:hover { text-decoration:underline; }
.ms-liste { max-height:240px; overflow-y:auto; display:flex; flex-direction:column; gap:0.1rem; }
.ms-item { display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0.4rem; border-radius:2px; cursor:pointer; font-size:0.92rem; }
.ms-item:hover { background:var(--papier-2); }
.ms-item input { width:auto; min-width:0; }
.ms-vide { font-style:italic; color:#6b6453; font-size:0.85rem; padding:0.4rem; }
.compte-liste { font-family:'Spline Sans Mono',monospace; font-size:0.75rem; color:#6b6453; margin-bottom:1rem; }
.liste { display:flex; flex-direction:column; gap:1.1rem; }
.exo { background:#fbf8f0; border:1px solid var(--trait); border-left:3px solid var(--accent); border-radius:3px; padding:1.4rem 1.6rem; box-shadow:0 8px 24px -18px rgba(0,0,0,0.4); animation:monte 0.4s ease both; }
@keyframes monte { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:none;} }
.exo-tete { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:0.9rem; }
.exo-meta { display:flex; flex-direction:column; gap:0.25rem; }
.badge-chap { font-family:'Spline Sans Mono',monospace; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--accent); font-weight:500; }
.exo-source { font-style:italic; font-size:0.85rem; color:#6b6453; }
.exo-elo { display:flex; align-items:center; gap:0.4rem; flex-shrink:0; }
.elo-pastille { width:9px; height:9px; border-radius:50%; background:var(--c); }
.elo-num { font-family:'Spline Sans Mono',monospace; font-weight:500; font-size:0.95rem; color:var(--c); }
.elo-label { font-family:'Spline Sans Mono',monospace; font-size:0.62rem; text-transform:uppercase; letter-spacing:0.1em; color:#6b6453; border:1px solid var(--trait); padding:0.15rem 0.4rem; border-radius:2px; }
.exo-enonce { font-size:1.12rem; line-height:1.6; }
.exo-tags { display:flex; flex-wrap:wrap; gap:0.4rem; margin-top:0.9rem; }
.tag { font-family:'Spline Sans Mono',monospace; font-size:0.7rem; background:var(--papier-2); color:#6b6453; padding:0.2rem 0.5rem; border-radius:2px; border:1px solid var(--trait); }
.exo-corr { margin-top:1rem; border-top:1px dashed var(--trait); padding-top:0.8rem; }
.corr-btn { font-family:'Spline Sans Mono',monospace; font-size:0.82rem; background:none; border:none; color:var(--accent); cursor:pointer; padding:0; }
.corr-btn:hover { text-decoration:underline; }
.corr-contenu { margin-top:0.8rem; padding:0.9rem 1.1rem; background:var(--papier-2); border-radius:3px; font-size:1.05rem; line-height:1.6; animation:monte 0.3s ease both; }
.exo-actions { display:flex; gap:0.7rem; margin-top:1.1rem; padding-top:0.9rem; border-top:1px solid var(--trait); }
.btn-reussi, .btn-rate { font-family:'Spline Sans Mono',monospace; font-size:0.85rem; padding:0.5rem 1rem; border:none; border-radius:2px; cursor:pointer; color:#fff; }
.btn-reussi { background:var(--vert); }
.btn-rate { background:var(--rouge); }
.deja { font-family:'Spline Sans Mono',monospace; font-size:0.8rem; color:#6b6453; font-style:italic; }
.exo-admin { margin-top:0.8rem; padding-top:0.8rem; border-top:1px dashed var(--rouge); }
.btn-suppr { font-family:'Spline Sans Mono',monospace; font-size:0.78rem; background:none; border:1px solid var(--rouge); color:var(--rouge); padding:0.35rem 0.7rem; border-radius:2px; cursor:pointer; height:fit-content; }
.btn-suppr:hover { background:var(--rouge); color:#fff; }
.info { text-align:center; padding:3rem 1rem; color:#6b6453; font-style:italic; font-size:1.05rem; }
/* COURS */
.cartes-grille { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:1rem; }
.mini-carte { background:#fbf8f0; border:1px solid var(--trait); border-radius:3px; overflow:hidden; }
.mini-recto { padding:0.8rem 1rem; font-size:1rem; border-bottom:1px dashed var(--trait); }
.mini-verso { padding:0.8rem 1rem; font-size:0.95rem; color:#6b6453; background:var(--papier-2); }
.revision { max-width:600px; margin:1rem auto; display:flex; flex-direction:column; align-items:center; gap:1.2rem; }
.revision-compteur { font-family:'Spline Sans Mono',monospace; font-size:0.8rem; color:#6b6453; }
.flashcard { width:100%; min-height:240px; background:#fbf8f0; border:1px solid var(--trait); border-left:3px solid var(--accent); border-radius:4px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:2rem; box-shadow:0 10px 30px -16px rgba(0,0,0,0.4); transition:transform 0.1s; }
.flashcard:hover { transform:translateY(-2px); }
.flashcard-face { text-align:center; width:100%; }
.flashcard-label { font-family:'Spline Sans Mono',monospace; font-size:0.65rem; text-transform:uppercase; letter-spacing:0.15em; color:#6b6453; display:block; margin-bottom:1rem; }
.flashcard-contenu { font-size:1.3rem; line-height:1.5; }
.flashcard-aide { margin-top:1.2rem; font-style:italic; font-size:0.85rem; color:#6b6453; }
.revision-actions { display:flex; gap:0.8rem; }
.revision-fin { text-align:center; display:flex; flex-direction:column; gap:1rem; align-items:center; padding:2rem; }
.import { max-width:700px; }
.import-aide { font-style:italic; color:#6b6453; margin-bottom:1rem; line-height:1.5; }
.import-zone { width:100%; font-family:'Spline Sans Mono',monospace; font-size:0.85rem; padding:0.8rem; border:1px solid var(--trait); background:var(--papier-2); border-radius:3px; outline:none; resize:vertical; }
.import-zone:focus { border-color:var(--accent); }
.import-bas { display:flex; align-items:center; gap:1rem; margin-top:1rem; }
.import-msg { font-family:'Spline Sans Mono',monospace; font-size:0.82rem; color:var(--accent); }

/* GENERATEUR DE DS */
.btn-imprimer { margin-top:0; padding:0.55rem 1rem; }
.ds-avert { color:var(--accent); font-family:'Spline Sans Mono',monospace; font-size:0.82rem; margin-top:0.5rem; }
.ds-feuille { background:#fff; border:1px solid var(--trait); border-radius:3px; padding:2.5rem; margin-top:1.5rem; max-width:820px; }
.ds-entete { border-bottom:2px solid var(--encre); padding-bottom:1rem; margin-bottom:1.5rem; }
.ds-entete h2 { font-family:'Fraunces',serif; font-size:1.8rem; }
.ds-ligne-nom { font-family:'Spline Sans Mono',monospace; font-size:0.85rem; color:#444; margin-top:0.8rem; }
.ds-partie { margin-bottom:1.8rem; }
.ds-partie h3 { font-family:'Fraunces',serif; font-size:1.3rem; margin-bottom:0.8rem; border-bottom:1px solid var(--trait); padding-bottom:0.3rem; }
.ds-ol { padding-left:1.4rem; display:flex; flex-direction:column; gap:1rem; }
.ds-item { font-size:1.08rem; line-height:1.6; padding-left:0.3rem; }
.ds-exo-meta { font-family:'Spline Sans Mono',monospace; font-size:0.72rem; color:#888; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.3rem; }
.ds-corrige { margin-top:2rem; }
.ds-saut-page { font-family:'Fraunces',serif; font-size:1.6rem; border-top:2px solid var(--encre); padding-top:1.5rem; }
.ds-q { font-weight:600; }
.ds-r { color:#444; margin-top:0.3rem; }
.ds-pas-corr { font-style:italic; color:#999; }

@media print {
  .no-print, .entete, .onglets { display:none !important; }
  .app { padding:0; background:#fff; }
  .ds-feuille { border:none; box-shadow:none; padding:0; max-width:none; margin:0; }
  .ds-saut-page { page-break-before:always; }
  .ds-item { page-break-inside:avoid; }
}
`;
