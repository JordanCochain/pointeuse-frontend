// ---------- Données et initialisation ----------
let donnees = JSON.parse(localStorage.getItem("pointages")) || {};
if (window.firebase && window.db) {
  const userId = localStorage.getItem("userId") || "utilisateur_test";
  firebase.firestore().collection("pointages").doc(userId).get()
    .then((doc) => {
      if (doc.exists) {
        donnees = doc.data();
        localStorage.setItem("pointages", JSON.stringify(donnees));
        afficherInfos(formatDate(new Date()));
      }
    })
    .catch((error) => console.error("Erreur de récupération Firestore :", error));
}

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();
let currentTab = localStorage.getItem("ongletActif");
document.getElementById("form-contact").addEventListener("submit", function(e) {
  e.preventDefault();

  const contact = {
    nom: this.nom.value,
    prenom: this.prenom.value,
    telephone: this.telephone.value,
    email: this.email.value
  };

  contacts.push(contact);
  localStorage.setItem("contacts", JSON.stringify(contacts));

  afficherContacts(); // 👈 pour recharger visuellement

  this.reset(); // réinitialiser le formulaire
});

// ---------- Fonctions de format ----------
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeString(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function afficherInfoBouton(type, message) {
  const info = document.getElementById("info-" + type);
  if (info) {
    info.textContent = message;
    info.classList.add("visible");

    setTimeout(() => {
      info.classList.remove("visible");
    }, 2500); // cache après 2,5s
  }
}

// ---------- Fonctions de pointage ----------
document.getElementById("btn-arrivee").onclick = () => enregistrerHeure("arrivee");
document.getElementById("btn-debut-pause").onclick = () => enregistrerHeure("debutPause");
document.getElementById("btn-fin-pause").onclick = () => enregistrerHeure("finPause");
document.getElementById("btn-depart").onclick = () => enregistrerHeure("depart");

document.getElementById("btn-enregistrer").onclick = () => {
  alert("Heures enregistrées !");
  calculerSalaireMensuel();
};

function enregistrerHeure(type) {
  const date = document.getElementById("date").value || formatDate(new Date());
  if (!donnees[date]) donnees[date] = {};

  if (donnees[date][type]) {
    alert(`Vous avez déjà pointé pour "${type}".`);
    return;
  }

  donnees[date][type] = new Date().toString();
  localStorage.setItem("pointages", JSON.stringify(donnees));

  if (window.firebase && window.db) {
    const userId = localStorage.getItem("userId") || "utilisateur_test";
    firebase.firestore().collection("pointages").doc(userId).set(donnees)
      .then(() => console.log("Données sauvegardées dans Firestore"))
      .catch((error) => console.error("Erreur de sauvegarde Firestore :", error));
  }

  afficherInfos(date);
  mettreAJourBoutons(date); // 👈 on appelle la fonction de verrouillage
}

function mettreAJourBoutons(dateStr) {
  const pointage = donnees[dateStr] || {};

  const correspondance = {
    "btn-arrivee": "arrivee",
    "btn-debut-pause": "debutPause",
    "btn-fin-pause": "finPause",
    "btn-depart": "depart"
  };

  Object.entries(correspondance).forEach(([idBtn, type]) => {
    const bouton = document.getElementById(idBtn);
    const info = document.getElementById("info-" + type);
    const dejaPointe = !!pointage[type];

    if (bouton) {
      bouton.disabled = dejaPointe;
      bouton.classList.remove("inactive");
      if (dejaPointe) bouton.classList.add("inactive");
    }

    if (info) {
      info.textContent = dejaPointe ? "Déjà pointé" : "";
      info.classList.toggle("visible", dejaPointe);
    }
  });
}
function calculerHeures(data) {
  const parseTime = str => {
    const [h, m] = str.split(":").map(Number);
    return h + m / 60;
  };

  if (!data.arrivee || !data.depart) return 0;

  const arrivee = parseTime(toTimeString(new Date(data.arrivee)));
  const depart = parseTime(toTimeString(new Date(data.depart)));
  const debutPause = data.debutPause ? parseTime(toTimeString(new Date(data.debutPause))) : 0;
  const finPause = data.finPause ? parseTime(toTimeString(new Date(data.finPause))) : 0;

  const travail = (depart - arrivee) - (finPause - debutPause);
  return Math.max(0, travail);
}
function calculerSalaireMensuel() {
  const tauxHoraire = parseFloat(document.getElementById("taux-horaire")?.value || "0");
  const seuilHS25 = parseFloat(document.getElementById("heures-sup25")?.value || "35");
  const seuilHS50 = parseFloat(document.getElementById("heures-sup50")?.value || "43");
  const primeSemestrielle = document.getElementById("prime-semestrielle")?.checked || false;

  const now = new Date();
  const moisActuel = now.getMonth() + 1;
  const anneeActuelle = now.getFullYear();

  let totalNormales = 0;
  let totalSup25 = 0;
  let totalSup50 = 0;

  for (let jour = 1; jour <= 31; jour++) {
    const jourStr = `${anneeActuelle}-${String(moisActuel).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
    const data = donnees[jourStr];
    if (!data || !data.arrivee || !data.depart) continue;

    const heures = calculerHeures(data);
    if (heures <= seuilHS25) {
      totalNormales += heures;
    } else if (heures <= seuilHS50) {
      totalNormales += seuilHS25;
      totalSup25 += heures - seuilHS25;
    } else {
      totalNormales += seuilHS25;
      totalSup25 += seuilHS50 - seuilHS25;
      totalSup50 += heures - seuilHS50;
    }
  }

  const salaireNormal = totalNormales * tauxHoraire;
  const salaireSup25 = totalSup25 * tauxHoraire * 1.25;
  const salaireSup50 = totalSup50 * tauxHoraire * 1.5;
  const prime = primeSemestrielle ? 100 : 0; // ajustable

  const total = salaireNormal + salaireSup25 + salaireSup50 + prime;

  document.getElementById("heures-travail").textContent = `Heures normales : ${totalNormales.toFixed(2)} h`;
  document.getElementById("heures-sup").textContent = `HS 25% : ${totalSup25.toFixed(2)} h, HS 50% : ${totalSup50.toFixed(2)} h`;
  document.getElementById("salaire-estime").textContent = `Salaire brut estimé : ${total.toFixed(2)} €`;
}

function afficherInfos(dateStr) {
  const pointage = donnees[dateStr];
if (!pointage) {
  document.getElementById("heures-travail").textContent = "";
  document.getElementById("heures-sup").textContent = "";
  document.getElementById("salaire-estime").textContent = "";

  afficherHeurePointage("arrivee", "");
  afficherHeurePointage("debutPause", "");
  afficherHeurePointage("finPause", "");
  afficherHeurePointage("depart", "");

  mettreAJourBoutons(dateStr);
  return;
}

  const arrivee = pointage.arrivee ? new Date(pointage.arrivee) : null;
  const debutPause = pointage.debutPause ? new Date(pointage.debutPause) : null;
  const finPause = pointage.finPause ? new Date(pointage.finPause) : null;
  const depart = pointage.depart ? new Date(pointage.depart) : null;

  afficherHeurePointage("arrivee", arrivee ? toTimeString(arrivee) : "");
  afficherHeurePointage("debutPause", debutPause ? toTimeString(debutPause) : "");
  afficherHeurePointage("finPause", finPause ? toTimeString(finPause) : "");
  afficherHeurePointage("depart", depart ? toTimeString(depart) : "");

  let heures = 0;
  if (arrivee && depart) {
    heures = (depart - arrivee) / 3600000;
    if (debutPause && finPause) {
      heures -= (finPause - debutPause) / 3600000;
    }
  }

  const heuresSup = Math.max(0, heures - 7);
  const taux = parseFloat(localStorage.getItem("tauxHoraire") || 0);
  const prime = parseFloat(localStorage.getItem("primeJournaliere") || 0);
  const salaire = (heures * taux) + (heures > 0 ? prime : 0);

  const heuresEntieres = Math.floor(heures);
  const minutes = Math.round((heures - heuresEntieres) * 60);
  const heuresSupEntieres = Math.floor(heuresSup);
  const minutesSup = Math.round((heuresSup - heuresSupEntieres) * 60);

  document.getElementById("heures-travail").textContent = `Heures travaillées : ${heuresEntieres} h ${minutes} min`;
  document.getElementById("heures-sup").textContent = `Heures supplémentaires : ${heuresSupEntieres} h ${minutesSup} min`;
  document.getElementById("salaire-estime").textContent = `Salaire estimé : ${salaire.toFixed(2)} €`;
}

function afficherHeurePointage(type, texteHeure) {
  const id = "heure-" + type;
  const el = document.getElementById(id);
  if (el) {
    el.textContent = texteHeure ? `Pointé à ${texteHeure}` : "Non pointé";
  }
}

function enregistrerHeure(type) {
  const date = document.getElementById("date").value || formatDate(new Date());

  if (donnees[date] && donnees[date][type]) {
    // ⛔ Déjà pointé, on affiche une indication
    afficherInfoBouton(type, "Déjà pointé !");
    return;
  }

  if (!donnees[date]) donnees[date] = {};
  donnees[date][type] = new Date().toString();

  localStorage.setItem("pointages", JSON.stringify(donnees));

  if (window.firebase && window.db) {
    const userId = localStorage.getItem("userId") || "utilisateur_test";
    firebase.firestore().collection("pointages").doc(userId).set(donnees)
      .then(() => console.log("Données sauvegardées dans Firestore"))
      .catch((error) => console.error("Erreur de sauvegarde Firestore :", error));
  }

  afficherInfos(date);
  mettreAJourBoutons(date);
}

document.getElementById("date").value = formatDate(new Date());
afficherInfos(formatDate(new Date()));
calculerSalaireMensuel();


document.getElementById("date").addEventListener("change", (e) => {
  const date = e.target.value;
  afficherInfos(e.target.value);
  mettreAJourBoutons(date); // ✅ ajoute ceci ici
});
// ---------- Gestion des onglets ----------
document.querySelectorAll("nav button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.getAttribute("data-tab");
    document.querySelectorAll("section").forEach(s => s.classList.toggle("active", s.id === target));
    localStorage.setItem("ongletActif", target);

    if (btn.dataset.tab === "agenda") {
    afficherMois(currentYear, currentMonth);
    }if (target === "pointage") {
      afficherInfos(document.getElementById("date").value);
    } else if (target === "evenements") {
      afficherFormulaireEvenement(); // ← affiche formulaire enrichi dans l'onglet
    } else if (target === "contact") {
      afficherContacts(); // ✅ affiche les contacts à l'ouverture de l'onglet
    } else if (target === "salaire") {
      afficherEstimationSalaireMensuel(); // ← ✅ appel de ta fonction
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const bouton = document.getElementById("enregistrer-evenement");
  if (!bouton) return;

  bouton.addEventListener("click", async (e) => {
    e.preventDefault();

    const evenement = {
      title: document.getElementById("titre-evenement").value.trim(),
      startDate: document.getElementById("date-debut-evenement").value,
      endDate: document.getElementById("date-fin-evenement").value,
      startTime: document.getElementById("heure-debut-evenement").value,
      endTime: document.getElementById("heure-fin-evenement").value,
      location: document.getElementById("lieu-evenement").value.trim(),
      description: document.getElementById("description-evenement").value.trim(),
      allDay: document.getElementById("journee-entiere-evenement").checked,
      repetition: document.getElementById("repetition-evenement").value,
      rappel: document.getElementById("rappel-evenement").value,
      userId: localStorage.getItem("userId") || "utilisateur_test",
      timestamp: new Date().toISOString()
    };

    const jours = getDateRange(evenement.startDate, evenement.endDate);
    jours.forEach(date => {
      if (!donnees[date]) donnees[date] = {};
      if (!donnees[date].evenements) donnees[date].evenements = [];
      donnees[date].evenements.push(evenement);
    });

    localStorage.setItem("pointages", JSON.stringify(donnees));

    if (window.firebase && window.db) {
      await firebase.firestore().collection("evenements").add(evenement);
    }

    // ✅ Ne pas forcer le changement de mois
    // ✅ Ne pas changer d'onglet
    // ✅ Juste mettre à jour les détails si l'agenda est ouvert
    if (document.getElementById("agenda").classList.contains("active")) {
      afficherDetailDansAgenda(evenement.startDate);
    }

    document.getElementById("form-evenement-outlook").reset();
    alert("Événement ajouté !");
  });
});

function afficherContacts() {
  const container = document.getElementById("contacts-list");
  container.innerHTML = ""; // vider avant de réafficher

  if (contacts.length === 0) {
    container.innerHTML = "<p>Aucun contact enregistré.</p>";
    return;
  }

  contacts.forEach((contact, index) => {
    const div = document.createElement("div");
    div.className = "contact-item";
    div.innerHTML = `
      <div class="contact-info">
        <div class="contact-nomprenom">${contact.nom} ${contact.prenom}</div>
        <div class="contact-contact">${contact.telephone} | ${contact.email}</div>
      </div>
    `;
    container.appendChild(div);
  });
}

function supprimerContact(index) {
  contacts.splice(index, 1);
  localStorage.setItem("contacts", JSON.stringify(contacts));
  afficherContacts();
}

// ---------- AGENDA ----------
const moisLabel = document.getElementById("mois-annee-label");
const calendrier = document.getElementById("grille-agenda");
const btnPrev = document.getElementById("mois-precedent");
const btnNext = document.getElementById("mois-suivant");

btnPrev.onclick = () => {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  afficherMois(currentYear, currentMonth);
};

btnNext.onclick = () => {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  afficherMois(currentYear, currentMonth);
};

function afficherMois(annee, mois) {
  calendrier.innerHTML = "";

  const premierJour = new Date(annee, mois, 1);
  const dernierJour = new Date(annee, mois + 1, 0);
  const nbJours = dernierJour.getDate();
  const premierJourSemaine = premierJour.getDay() === 0 ? 7 : premierJour.getDay();

  moisLabel.textContent = premierJour.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  const joursSemaine = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  joursSemaine.forEach(j => {
    const header = document.createElement("div");
    header.classList.add("agenda-header");
    header.textContent = j;
    calendrier.appendChild(header);
  });

  for (let i = 1; i < premierJourSemaine; i++) {
    const vide = document.createElement("div");
    vide.classList.add("agenda-cell");
    calendrier.appendChild(vide);
  }

  for (let jour = 1; jour <= nbJours; jour++) {
    const cell = document.createElement("div");
    cell.classList.add("agenda-cell");
    const dateObj = new Date(annee, mois, jour);
    const dateStr = formatDate(dateObj);

    const jourNumero = document.createElement("div");
    jourNumero.textContent = jour;
    jourNumero.style.fontWeight = "bold";
    jourNumero.style.marginBottom = "4px";
    cell.appendChild(jourNumero);

    if (donnees[dateStr]) {
      cell.classList.add("has-data");

      const pointage = donnees[dateStr];
      const arrivee = pointage.arrivee ? new Date(pointage.arrivee) : null;
      const debutPause = pointage.debutPause ? new Date(pointage.debutPause) : null;
      const finPause = pointage.finPause ? new Date(pointage.finPause) : null;
      const depart = pointage.depart ? new Date(pointage.depart) : null;

      let heures = 0;
      if (arrivee && depart) {
        heures = (depart - arrivee) / 3600000;
        if (debutPause && finPause) {
          heures -= (finPause - debutPause) / 3600000;
        }
      }

      const résuméHeures = document.createElement("div");
      résuméHeures.textContent = `${heures.toFixed(2)} h`;
      résuméHeures.style.fontSize = "0.85em";
      résuméHeures.style.color = "#1565c0";
      cell.appendChild(résuméHeures);

      if (pointage.evenements && pointage.evenements.length > 0) {
        const badge = document.createElement("div");
        badge.textContent = `📌 ${pointage.evenements.length} év.`;
        badge.style.fontSize = "0.75em";
        badge.style.color = "#6a1b9a";
        badge.style.marginTop = "4px";
        cell.appendChild(badge);
      }
    }

    cell.onclick = () => { afficherDetailDansAgenda(dateStr); };;

    calendrier.appendChild(cell);
  }
}

afficherMois(currentYear, currentMonth);
  
  document.getElementById("cancel-event").onclick = () => {
  document.getElementById("modal-evenement-outlook").style.display = "none";
};

document.getElementById("save-event").onclick = async function(e) {
  e.preventDefault();

  const evenement = {
    title: document.getElementById("titre-outlook").value.trim(),
    startDate: document.getElementById("date-debut-outlook").value,
    endDate: document.getElementById("date-fin-outlook").value,
    startTime: document.getElementById("heure-debut-outlook").value,
    endTime: document.getElementById("heure-fin-outlook").value,
    location: document.getElementById("lieu-outlook").value.trim(),
    description: document.getElementById("description-outlook").value.trim(),
    allDay: document.getElementById("journee-entiere").checked,
    userId: localStorage.getItem("userId") || "utilisateur_test",
    timestamp: new Date().toISOString()
  };

  const jours = getDateRange(evenement.startDate, evenement.endDate);
  jours.forEach(date => {
    if (!donnees[date]) donnees[date] = {};
    if (!donnees[date].evenements) donnees[date].evenements = [];
    donnees[date].evenements.push(evenement);
  });

  localStorage.setItem("pointages", JSON.stringify(donnees));

  if (window.firebase && window.db) {
    await firebase.firestore().collection("evenements").add(evenement);
  }

  document.getElementById("modal-evenement-outlook").style.display = "none";
  afficherMois(currentYear, currentMonth);
};

function afficherDetailDansAgenda(dateStr) {
  const container = document.getElementById("detail-jour");
  const pointage = donnees[dateStr] || {};
  let html = `<h3>Détail du ${dateStr}</h3>`;

  const arrivee = pointage.arrivee ? new Date(pointage.arrivee) : null;
  const debutPause = pointage.debutPause ? new Date(pointage.debutPause) : null;
  const finPause = pointage.finPause ? new Date(pointage.finPause) : null;
  const depart = pointage.depart ? new Date(pointage.depart) : null;

  let heures = 0;
  if (arrivee && depart) {
    heures = (depart - arrivee) / 3600000;
    if (debutPause && finPause) {
      heures -= (finPause - debutPause) / 3600000;
    }
  }

  const heuresSup = Math.max(0, heures - 7);
  const heuresEntieres = Math.floor(heures);
  const minutes = Math.round((heures - heuresEntieres) * 60);
  const heuresSupEntieres = Math.floor(heuresSup);
  const minutesSup = Math.round((heuresSup - heuresSupEntieres) * 60);

  html += `
    <p><strong>Heures travaillées :</strong> ${heuresEntieres} h ${minutes} min</p>
    <p><strong>Heures supplémentaires :</strong> ${heuresSupEntieres} h ${minutesSup} min</p>
    <p><strong>Pointage :</strong><br>
      - Arrivée : ${arrivee ? toTimeString(arrivee) : "Non pointé"}<br>
      - Début pause : ${debutPause ? toTimeString(debutPause) : "Non pointé"}<br>
      - Fin pause : ${finPause ? toTimeString(finPause) : "Non pointé"}<br>
      - Départ : ${depart ? toTimeString(depart) : "Non pointé"}
    </p>
  `;

  if (pointage.evenements && pointage.evenements.length > 0) {
    html += "<ul id='liste-evenements'>";

    pointage.evenements.forEach((ev, index) => {
      html += `
        <li class="evenement-ligne">
          <strong>${ev.title}</strong><br>
          Du ${ev.startDate} au ${ev.endDate} de ${ev.startTime || "?"} à ${ev.endTime || "?"}<br>
          📍 ${ev.location}<br>
          📝 ${ev.description || ""}<br>
          <button class="btn-supprimer" data-date="${dateStr}" data-index="${index}">🗑 Supprimer</button>
        </li>
      `;
    });

    html += "</ul>";
  } else {
    html += "<p>Aucun événement.</p>";
  }

  container.innerHTML = html;

  // 🎯 Gérer le clic sur les boutons Supprimer
  container.querySelectorAll(".btn-supprimer").forEach(btn => {
    btn.addEventListener("click", () => {
      const date = btn.dataset.date;
      const index = btn.dataset.index;

      if (confirm("Supprimer cet événement ?")) {
        donnees[date].evenements.splice(index, 1);
        if (donnees[date].evenements.length === 0) {
          delete donnees[date].evenements;
        }

        localStorage.setItem("pointages", JSON.stringify(donnees));

        if (window.firebase && window.db) {
          console.log("⚠️ À adapter : suppression Firebase si activée");
        }

        afficherMois(currentYear, currentMonth);
        afficherDetailDansAgenda(date);
      }
    });
  });
}
// ---------- EXPORT EXCEL ----------
document.getElementById("btn-export-excel").onclick = () => {
  exportExcelMois(currentYear, currentMonth);
};

function exportExcelMois(annee, mois) {
  const donneesMois = [];
  donneesMois.push(["Date", "Arrivée", "Début pause", "Fin pause", "Départ", "Heures totales", "Heures sup.", "Événements"]);

  const joursMois = new Date(annee, mois + 1, 0).getDate();

  for (let jour = 1; jour <= joursMois; jour++) {
    const dateStr = formatDate(new Date(annee, mois, jour));
    const p = donnees[dateStr] || {};
    const arrivee = p.arrivee ? toTimeString(new Date(p.arrivee)) : "";
    const debutPause = p.debutPause ? toTimeString(new Date(p.debutPause)) : "";
    const finPause = p.finPause ? toTimeString(new Date(p.finPause)) : "";
    const depart = p.depart ? toTimeString(new Date(p.depart)) : "";

    let heures = 0;
    if (p.arrivee && p.depart) {
      heures = (new Date(p.depart) - new Date(p.arrivee)) / 3600000;
      if (p.debutPause && p.finPause) {
        heures -= (new Date(p.finPause) - new Date(p.debutPause)) / 3600000;
      }
    }
    const heuresSup = Math.max(0, heures - 7);
    const evenementsText = (p.evenements || []).map(ev =>
      `${ev.title} (${ev.startDate} → ${ev.endDate})`
    ).join(" | ");

    donneesMois.push([
      dateStr, arrivee, debutPause, finPause, depart,
      heures.toFixed(2), heuresSup.toFixed(2), evenementsText
    ]);
  }

  const csvContent = donneesMois.map(e => e.join(";")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pointage-${annee}-${(mois + 1).toString().padStart(2, "0")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
// ---------- FORMULAIRE ÉVÉNEMENTS (onglet uniquement) ----------
function getDateRange(start, end) {
  const range = [];
  const dStart = new Date(start);
  const dEnd = new Date(end);
  while (dStart <= dEnd) {
    range.push(formatDate(dStart));
    dStart.setDate(dStart.getDate() + 1);
  }
  return range;
}
document.addEventListener("DOMContentLoaded", () => {
  const bouton = document.getElementById("enregistrer-evenement");
  if (!bouton) return;

  bouton.addEventListener("click", async (e) => {
    e.preventDefault();

    const evenement = {
      title: document.getElementById("titre-evenement").value.trim(),
      startDate: document.getElementById("date-debut-evenement").value,
      endDate: document.getElementById("date-fin-evenement").value,
      startTime: document.getElementById("heure-debut-evenement").value,
      endTime: document.getElementById("heure-fin-evenement").value,
      location: document.getElementById("lieu-evenement").value.trim(),
      description: document.getElementById("description-evenement").value.trim(),
      allDay: document.getElementById("journee-entiere-evenement").checked,
      repetition: document.getElementById("repetition-evenement").value,
      rappel: document.getElementById("rappel-evenement").value,
      userId: localStorage.getItem("userId") || "utilisateur_test",
      timestamp: new Date().toISOString()
    };

    const jours = getDateRange(evenement.startDate, evenement.endDate);
    jours.forEach(date => {
      if (!donnees[date]) donnees[date] = {};
      if (!donnees[date].evenements) donnees[date].evenements = [];
      donnees[date].evenements.push(evenement);
    });

    localStorage.setItem("pointages", JSON.stringify(donnees));

    if (window.firebase && window.db) {
      await firebase.firestore().collection("evenements").add(evenement);
    }

    // ✅ Mise à jour du mois courant pour forcer l'affichage
    const d = new Date(evenement.startDate);
    currentYear = d.getFullYear();
    currentMonth = d.getMonth();

    afficherMois(currentYear, currentMonth);
    afficherDetailDansAgenda(evenement.startDate);

    document.getElementById("form-evenement-outlook").reset();
    alert("Événement ajouté !");
  });
});
document.querySelectorAll("nav button").forEach(btn => {
  btn.addEventListener("click", () => {
    const tabId = btn.dataset.tab;

    document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));
    document.getElementById(tabId).classList.add("active");

    document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    // 🧠 Sauvegarder l’onglet actif
    localStorage.setItem("onglet-actif", tabId);

    // 🔁 Rafraîchir agenda si c’est l’onglet Agenda
    if (tabId === "agenda") {
      afficherMois(currentYear, currentMonth);
    }
  });
});

document.getElementById("forcer-synchro").addEventListener("click", () => {
  alert("Synchronisation forcée (simulée).");
});

document.getElementById("voir-tutoriel").addEventListener("click", () => {
  alert("Ouverture du tutoriel (à implémenter).");
});
function afficherEstimationSalaireMensuel() {
  const tauxHoraire = parseFloat(document.getElementById("taux-horaire")?.value || "0");
  const seuilHS25 = parseFloat(document.getElementById("heures-sup25")?.value || "35");
  const seuilHS50 = parseFloat(document.getElementById("heures-sup50")?.value || "43");
  const primeSemestrielle = document.getElementById("prime-semestrielle")?.checked || false;

  const now = new Date();
  const moisActuel = now.getMonth() + 1;
  const anneeActuelle = now.getFullYear();

  let totalNormales = 0;
  let totalSup25 = 0;
  let totalSup50 = 0;

  for (let jour = 1; jour <= 31; jour++) {
    const jourStr = `${anneeActuelle}-${String(moisActuel).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
    const data = donnees[jourStr];
    if (!data || !data.arrivee || !data.depart) continue;

    const heures = calculerHeures(data);
    if (heures <= seuilHS25) {
      totalNormales += heures;
    } else if (heures <= seuilHS50) {
      totalNormales += seuilHS25;
      totalSup25 += heures - seuilHS25;
    } else {
      totalNormales += seuilHS25;
      totalSup25 += seuilHS50 - seuilHS25;
      totalSup50 += heures - seuilHS50;
    }
  }

  const salaireNormal = totalNormales * tauxHoraire;
  const salaireSup25 = totalSup25 * tauxHoraire * 1.25;
  const salaireSup50 = totalSup50 * tauxHoraire * 1.5;
  const prime = primeSemestrielle ? 100 : 0;
  const total = salaireNormal + salaireSup25 + salaireSup50 + prime;

  document.getElementById("salaire-heures-normales").textContent = `Heures normales : ${totalNormales.toFixed(2)} h`;
  document.getElementById("salaire-heures-sup").textContent = `HS 25% : ${totalSup25.toFixed(2)} h, HS 50% : ${totalSup50.toFixed(2)} h`;
  document.getElementById("salaire-brut-estime").textContent = `Salaire brut estimé : ${total.toFixed(2)} €`;
}

document.getElementById("recalculer-salaire").addEventListener("click", afficherEstimationSalaireMensuel);
document.addEventListener("DOMContentLoaded", () => {
  const bouton = document.getElementById("enregistrer-evenement");
  if (!bouton) return;

  bouton.addEventListener("click", async (e) => {
    e.preventDefault();

    const evenement = {
      title: document.getElementById("titre-evenement").value.trim(),
      startDate: document.getElementById("date-debut-evenement").value,
      endDate: document.getElementById("date-fin-evenement").value,
      startTime: document.getElementById("heure-debut-evenement").value,
      endTime: document.getElementById("heure-fin-evenement").value,
      location: document.getElementById("lieu-evenement").value.trim(),
      description: document.getElementById("description-evenement").value.trim(),
      allDay: document.getElementById("journee-entiere-evenement").checked,
      repetition: document.getElementById("repetition-evenement").value,
      rappel: document.getElementById("rappel-evenement").value,
      userId: localStorage.getItem("userId") || "utilisateur_test",
      timestamp: new Date().toISOString()
    };

    const jours = getDateRange(evenement.startDate, evenement.endDate);
    jours.forEach(date => {
      if (!donnees[date]) donnees[date] = {};
      if (!donnees[date].evenements) donnees[date].evenements = [];
      donnees[date].evenements.push(evenement);
    });

    localStorage.setItem("pointages", JSON.stringify(donnees));
    alert("Événement ajouté !");
    afficherMois(currentYear, currentMonth);
    afficherDetailDansAgenda(evenement.startDate);
    document.getElementById("form-evenement-outlook").reset();
  });
});
document.addEventListener("DOMContentLoaded", () => {
  // 🔁 Récupérer l’onglet actif précédemment enregistré
  const ongletActif = localStorage.getItem("onglet-actif");

  // ❌ Ne pas forcer "pointage" si rien n’est défini
  if (ongletActif) {
    document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));
    document.getElementById(ongletActif)?.classList.add("active");

    document.querySelectorAll("nav button").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === ongletActif);
    });

    if (ongletActif === "agenda") {
      afficherMois(currentYear, currentMonth);
    } else if (ongletActif === "pointage") {
      afficherInfos(document.getElementById("date")?.value);
    } else if (ongletActif === "evenements") {
      afficherFormulaireEvenement?.();
    } else if (ongletActif === "contact") {
      afficherContacts?.();
    } else if (ongletActif === "salaire") {
      afficherEstimationSalaireMensuel?.();
    }
  }

  // 🔁 Enregistrement de l’onglet actif au clic
  document.querySelectorAll("nav button").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;

      document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));
      document.getElementById(tabId)?.classList.add("active");

      document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      localStorage.setItem("onglet-actif", tabId);

      if (tabId === "agenda") {
        afficherMois(currentYear, currentMonth);
      }
    });
  });

  // ✅ Gestion du formulaire événement Outlook-like
  const bouton = document.getElementById("enregistrer-evenement");
  if (bouton) {
    bouton.addEventListener("click", async (e) => {
      e.preventDefault();

      const evenement = {
        title: document.getElementById("titre-evenement").value.trim(),
        startDate: document.getElementById("date-debut-evenement").value,
        endDate: document.getElementById("date-fin-evenement").value,
        startTime: document.getElementById("heure-debut-evenement").value,
        endTime: document.getElementById("heure-fin-evenement").value,
        location: document.getElementById("lieu-evenement").value.trim(),
        description: document.getElementById("description-evenement").value.trim(),
        allDay: document.getElementById("journee-entiere-evenement").checked,
        repetition: document.getElementById("repetition-evenement").value,
        rappel: document.getElementById("rappel-evenement").value,
        userId: localStorage.getItem("userId") || "utilisateur_test",
        timestamp: new Date().toISOString()
      };

      const jours = getDateRange(evenement.startDate, evenement.endDate);
      jours.forEach(date => {
        if (!donnees[date]) donnees[date] = {};
        if (!donnees[date].evenements) donnees[date].evenements = [];
        donnees[date].evenements.push(evenement);
      });

      localStorage.setItem("pointages", JSON.stringify(donnees));

      if (window.firebase && window.db) {
        await firebase.firestore().collection("evenements").add(evenement);
      }

      if (document.getElementById("agenda")?.classList.contains("active")) {
        afficherMois(currentYear, currentMonth);
        afficherDetailDansAgenda(evenement.startDate);
      }

      document.getElementById("form-evenement-outlook").reset();
      alert("Événement ajouté !");
    });
  }
});
const vapidPublicKey = "BLLm1M5a6mbosdP6muqeRZEgfLO_freUQz7klFcyiTtRGRLRxUtvlyxS6gxx6Knl324mu6kaL9wiv2WWTYUMcxE"; // Remplace par ta vraie clé publique

// Convertit la clé en Uint8Array pour l'API Push
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function subscribeToPushNotifications() {
  if (!('serviceWorker' in navigator)) return;
  if (!('PushManager' in window)) return;

  try {
    const permission = await Notification.requestPermission();
    console.log("Permission actuelle :", permission);
    alert("Permission actuelle : " + permission);
    if (permission !== 'granted') {
      console.warn("Notifications refusées");
      return;
    }

    const registration = await navigator.serviceWorker.register('service-worker.js');
    console.log('Service Worker enregistré');

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    await fetch("https://notif-server-az9m.onrender.com/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription),
      headers: {
        "Content-Type": "application/json"
      }
    });

    console.log("✅ Abonnement push envoyé au serveur.");
  } catch (err) {
    console.error("Erreur d’abonnement push :", err);
  }
}

// ✅ En dehors de la fonction :
document.addEventListener("DOMContentLoaded", () => {
  subscribeToPushNotifications();
});

