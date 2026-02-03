export function adminAuthMiddleware(request, reply, done) {
  const auth = request.headers.authorization;

  if (!auth || !auth.startsWith('Basic ')) {
    reply.code(401).header('WWW-Authenticate', 'Basic realm="Admin Panel"').send({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  const [username, password] = credentials;

  const validUsername = process.env.ADMIN_USERNAME || 'admin';
  const validPassword = process.env.ADMIN_PASSWORD || 'admin';

  if (username !== validUsername || password !== validPassword) {
    reply.code(401).header('WWW-Authenticate', 'Basic realm="Admin Panel"').send({
      success: false,
      error: 'Invalid credentials',
    });
    return;
  }

  done();
}
