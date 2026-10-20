// Where to go after signing in: the page that sent the user to the sign-in
// screen (ProtectedRoute passes it as state.from), or the dashboard
export function redirectTarget(location) {
  const from = location.state?.from;
  return from?.pathname ? `${from.pathname}${from.search ?? ''}` : '/';
}
