export function setCorsHeaders(request, response, allowedOrigins) {
  const origin = request.headers.origin;
  if (allowedOrigins.has(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-methods', 'GET, PUT, POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');
    response.setHeader('access-control-allow-credentials', 'true');
    response.setHeader('vary', 'Origin');
  }
}