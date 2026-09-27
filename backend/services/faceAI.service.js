const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const AI_TIMEOUT_MS = parseInt(process.env.AI_SERVICE_TIMEOUT_MS || '120000', 10);

const postJSON = async (path, body) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data = null;
    let parsed = false;
    try {
      data = JSON.parse(raw);
      parsed = true;
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      const detail = parsed ? data?.detail : undefined;
      const fallback = (raw || '').trim().slice(0, 300);
      const message =
        typeof detail === 'string'
          ? detail
          : detail?.message || fallback || `Face AI service error (${res.status})`;
      const error = new Error(message);
      error.status = res.status >= 500 ? 502 : 422;
      error.code = (typeof detail === 'object' && detail?.code) || 'ai_error';
      throw error;
    }
    if (!parsed) {
      const error = new Error(`Face AI service returned an unreadable response (${res.status})`);
      error.status = 502;
      error.code = 'ai_bad_response';
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Face AI service timed out');
      timeouterror.status = 504;
      timeoutError.code = 'ai_timeout';
      throw timeoutError;
    }
    if (error.status) throw error;
    const offlineError = new Error(
      `Face AI service is unreachable at ${AI_SERVICE_URL}. Start it with: cd ai-service && python main.py`
    );
    offlineerror.status = 503;
    offlineError.code = 'ai_offline';
    throw offlineError;
  } finally {
    clearTimeout(timer);
  }
};

const matchFace = (image, topK = 3) => postJSON('/face/match', { image, top_k: topK });

const registerFace = (studentId, image) => postJSON('/face/register', { student_id: studentId, image });

const getHealth = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${AI_SERVICE_URL}/health`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Face AI service returned ${res.status}`);
    return await res.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Face AI service health check timed out');
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { matchFace, registerFace, getHealth, AI_SERVICE_URL };
