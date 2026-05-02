function randomState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({ request, env }) {
  if (!env.GITHUB_CLIENT_ID) {
    return new Response('Missing GITHUB_CLIENT_ID environment variable.', { status: 500 });
  }

  const url = new URL(request.url);
  const state = randomState();
  const redirectUrl = new URL('https://github.com/login/oauth/authorize');

  redirectUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  redirectUrl.searchParams.set('redirect_uri', `${url.origin}/api/callback`);
  redirectUrl.searchParams.set('scope', env.GITHUB_OAUTH_SCOPE || 'repo user:email');
  redirectUrl.searchParams.set('state', state);

  const headers = new Headers({
    Location: redirectUrl.toString(),
    'Set-Cookie': `cpil_oauth_state=${state}; Max-Age=600; Path=/api/callback; HttpOnly; Secure; SameSite=Lax`,
    'Cache-Control': 'no-store',
  });

  return new Response(null, { status: 302, headers });
}
