// Turns an axios error into a message that is safe and useful to show.
// The API's own `detail` messages are written for users, so they win.
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;

  if (error.response) {
    const { status, data } = error.response;
    const detail = data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    // FastAPI validation errors: [{ loc, msg, type }]
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    if (status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (status >= 500) return 'The server ran into a problem. Please try again.';
    return fallback;
  }

  if (error.request) {
    return "Can't reach StudyVault right now. Check your connection and try again.";
  }

  return fallback;
}

export const isNotFound = (error) => error?.response?.status === 404;
