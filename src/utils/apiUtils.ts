/**
 * Safely parses JSON from a Response object without throwing "Unexpected token < in JSON at position 0".
 * If the response is HTML or unparseable, returns a fallback object containing a clean error message.
 */
export async function safeParseJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) {
    return { success: res.ok };
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    console.warn(`[API] Server returned non-JSON response (${res.status} ${res.statusText}):`, text.substring(0, 150));
    return {
      error: `Server error (${res.status}): ${res.statusText || 'Unexpected non-JSON response received'}`,
      rawText: text.substring(0, 300)
    };
  }
}
