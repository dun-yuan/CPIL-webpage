function parseCookies(cookieHeader) {
  return Object.fromEntries(
    (cookieHeader || '')
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const [name, ...value] = cookie.split('=');
        return [name, value.join('=')];
      }),
  );
}

function cmsResponse(status, payload, responseStatus = 200) {
  const message = `authorization:github:${status}:${JSON.stringify(payload)}`;
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>GitHub Authentication</title>
  </head>
  <body>
    <p>Completing GitHub authentication...</p>
    <script>
      const message = ${JSON.stringify(message)};
      if (window.opener) {
        window.opener.postMessage(message, window.location.origin);
        window.close();
      } else {
        document.body.textContent = 'Authentication complete. You can close this window.';
      }
    </script>
  </body>
</html>`;

  return new Response(body, {
    status: responseStatus,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': 'cpil_oauth_state=; Max-Age=0; Path=/api/callback; HttpOnly; Secure; SameSite=Lax',
    },
  });
}

export async function onRequest({ request, env }) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return cmsResponse('error', {
      error: 'missing_config',
      error_description: 'Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET environment variable.',
    }, 500);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const storedState = parseCookies(request.headers.get('Cookie')).cpil_oauth_state;

  if (!code) {
    return cmsResponse('error', {
      error: 'missing_code',
      error_description: 'GitHub did not return an authorization code.',
    }, 400);
  }

  if (!returnedState || !storedState || returnedState !== storedState) {
    return cmsResponse('error', {
      error: 'invalid_state',
      error_description: 'OAuth state did not match. Please try logging in again.',
    }, 400);
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'cpil-decap-cms-oauth',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/callback`,
    }),
  });

  const tokenResult = await tokenResponse.json();

  if (!tokenResponse.ok || tokenResult.error) {
    return cmsResponse('error', {
      error: tokenResult.error || 'token_exchange_failed',
      error_description: tokenResult.error_description || 'GitHub token exchange failed.',
    }, 401);
  }

  return cmsResponse('success', {
    token: tokenResult.access_token,
    provider: 'github',
  });
}
