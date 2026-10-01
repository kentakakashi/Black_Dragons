const { getFirestore } = require("firebase-admin/firestore");

const SOURCE_COLLECTION = "aiKnowledgeSources";
const CHUNK_COLLECTION = "aiKnowledgeChunks";

const MAX_SOURCE_TITLE = 120;
const MAX_TEXT = 50000;
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;
const MAX_RETRIEVAL = 5;

function db() {
  return getFirestore();
}

function cleanTitle(value) {
  return String(value || "Untitled source")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SOURCE_TITLE);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanTitle(match?.[1] || "Web source");
}

function chunkText(text) {
  const clean = normalizeText(text);
  if (!clean) return [];

  const paragraphs = clean
    .split(/\n{2,}|(?<=\.)\s{2,}/)
    .map(part => part.trim())
    .filter(part => part.length >= 25);

  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > CHUNK_SIZE) {
      chunks.push(current.trim());
      const tail = current.slice(-CHUNK_OVERLAP);
      current = tail + "\n" + paragraph;
    } else {
      current += (current ? "\n\n" : "") + paragraph;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  if (!chunks.length && clean.length >= 25) {
    for (let i = 0; i < clean.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      chunks.push(clean.slice(i, i + CHUNK_SIZE));
    }
  }

  return chunks.slice(0, 120);
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2);
}

function score(queryTokens, docTokens) {
  if (!queryTokens.length || !docTokens.length) return 0;

  const frequencies = new Map();
  for (const token of docTokens) {
    frequencies.set(token, (frequencies.get(token) || 0) + 1);
  }

  let total = 0;
  for (const token of queryTokens) {
    const tf = frequencies.get(token) || 0;
    if (!tf) continue;
    total += 1 + Math.log(1 + tf);
  }

  return total;
}

async function addText(guildId, title, text, addedBy) {
  const normalized = normalizeText(text);
  if (normalized.length < 25) {
    throw new Error("Knowledge text is too short.");
  }

  const chunks = chunkText(normalized);
  const sourceRef = await db().collection(SOURCE_COLLECTION).add({
    guildId: String(guildId),
    title: cleanTitle(title),
    type: "text",
    addedBy: String(addedBy || ""),
    url: null,
    chunkCount: chunks.length,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  const batch = db().batch();
  chunks.forEach((content, index) => {
    const ref = db().collection(CHUNK_COLLECTION).doc();
    batch.set(ref, {
      guildId: String(guildId),
      sourceId: sourceRef.id,
      sourceTitle: cleanTitle(title),
      chunkIndex: index,
      content,
      createdAt: Date.now()
    });
  });
  await batch.commit();

  return {
    sourceId: sourceRef.id,
    title: cleanTitle(title),
    chunks: chunks.length
  };
}

async function addUrl(guildId, url, addedBy) {
  const value = String(url || "").trim();

  if (!/^https?:\/\//i.test(value)) {
    throw new Error("Only http:// and https:// URLs are allowed.");
  }

  const response = await fetch(value, {
    headers: {
      "User-Agent": "BLACK-DRAGONS-AI/1.0"
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error("The source returned HTTP " + response.status + ".");
  }

  const html = await response.text();
  const title = extractTitle(html);
  const text = stripHtml(html).slice(0, MAX_TEXT);

  const result = await addText(guildId, title, text, addedBy);

  const ref = db().collection(SOURCE_COLLECTION).doc(result.sourceId);
  await ref.update({
    type: "url",
    url: value,
    updatedAt: Date.now()
  });

  return {
    ...result,
    url: value
  };
}

async function retrieve(guildId, query, topK = MAX_RETRIEVAL) {
  const value = String(query || "").trim();
  const queryTokens = tokenize(value);
  if (!value || !queryTokens.length) return [];

  const snapshot = await db()
    .collection(CHUNK_COLLECTION)
    .where("guildId", "==", String(guildId))
    .limit(400)
    .get();

  if (snapshot.empty) return [];

  const docs = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const content = String(data.content || "");
    const tokens = tokenize(content);
    const points = score(queryTokens, tokens);
    if (points > 0) {
      docs.push({
        score: points,
        title: String(data.sourceTitle || "Server knowledge"),
        content: content.slice(0, 1800)
      });
    }
  }

  return docs
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(MAX_RETRIEVAL, Number(topK) || MAX_RETRIEVAL)))
    .map(item => ({
      title: item.title,
      content: item.content
    }));
}

async function listSources(guildId) {
  const snapshot = await db()
    .collection(SOURCE_COLLECTION)
    .where("guildId", "==", String(guildId))
    .limit(100)
    .get();

  return snapshot.docs
    .map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

async function removeSource(guildId, sourceId) {
  const id = String(sourceId || "").trim();
  if (!id) throw new Error("Source ID is required.");

  const sourceRef = db().collection(SOURCE_COLLECTION).doc(id);
  const source = await sourceRef.get();

  if (!source.exists || String(source.data()?.guildId) !== String(guildId)) {
    return false;
  }

  const chunks = await db()
    .collection(CHUNK_COLLECTION)
    .where("guildId", "==", String(guildId))
    .where("sourceId", "==", id)
    .limit(400)
    .get();

  const batch = db().batch();
  for (const doc of chunks.docs) {
    batch.delete(doc.ref);
  }
  batch.delete(sourceRef);
  await batch.commit();

  return true;
}

module.exports = {
  addText,
  addUrl,
  retrieve,
  listSources,
  removeSource,
  chunkText
};
