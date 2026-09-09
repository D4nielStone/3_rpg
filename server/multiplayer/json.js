export async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 32 * 1024 * 1024) throw new Error('Payload too large');
  }
  return JSON.parse(body || '{}');
}

export function sendJson(response, statusCode, body, headers = {}) {
  Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}