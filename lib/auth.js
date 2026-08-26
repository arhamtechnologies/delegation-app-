import { supabaseBrowser } from './supabase-browser';

let authenticatedUserResultRequest = null;
let currentEmployeeRequest = null;
let cachedSession = null;
let sessionLoaded = false;
let currentEmployeeResult = null;
let currentEmployeeUserId = null;
let currentEmployeeCachedAt = 0;
const currentEmployeeCacheTtl = 30000;

function setCachedSession(session) {
  const nextUserId = session?.user?.id || null;
  if (currentEmployeeUserId && currentEmployeeUserId !== nextUserId) {
    currentEmployeeResult = null;
    currentEmployeeUserId = null;
    currentEmployeeCachedAt = 0;
  }
  cachedSession = session || null;
  sessionLoaded = true;
}

export function syncAuthSession(session) {
  setCachedSession(session);
}

export function clearAuthCache() {
  cachedSession = null;
  sessionLoaded = true;
  authenticatedUserResultRequest = null;
  currentEmployeeRequest = null;
  currentEmployeeResult = null;
  currentEmployeeUserId = null;
  currentEmployeeCachedAt = 0;
}

async function getAuthSession() {
  if (sessionLoaded) return { session: cachedSession, error: null };
  if (!authenticatedUserResultRequest) {
    authenticatedUserResultRequest = (async () => {
      const { data: { session } = {}, error } = await supabaseBrowser().auth.getSession();
      setCachedSession(session || null);
      return { session: session || null, error };
    })().finally(() => {
      authenticatedUserResultRequest = null;
    });
  }
  return authenticatedUserResultRequest;
}

function getAuthenticatedUserResult() {
  return getAuthSession().then(({ session, error }) => ({ user: session?.user || null, error }));
}

export async function getAuthenticatedUser() {
  const { user } = await getAuthenticatedUserResult();
  return user;
}

export function invalidateCurrentEmployee() {
  currentEmployeeResult = null;
  currentEmployeeUserId = null;
  currentEmployeeCachedAt = 0;
}

export function getCurrentEmployee() {
  if (currentEmployeeResult && Date.now() - currentEmployeeCachedAt < currentEmployeeCacheTtl) return Promise.resolve(currentEmployeeResult);
  if (!currentEmployeeRequest) {
    currentEmployeeRequest = (async () => {
      const supabase = supabaseBrowser();
      const { user, error: userError } = await getAuthenticatedUserResult();
      if (userError || !user) return { user: null, employee: null, error: userError };
      const { data: employee, error } = await supabase.from('employees').select('id,name,email,role,active,must_change_password').eq('auth_user_id', user.id).maybeSingle();
      return { user, employee, error };
    })().then((result) => {
      if (result.user && result.employee) {
        currentEmployeeUserId = result.user.id;
        currentEmployeeResult = result;
        currentEmployeeCachedAt = Date.now();
      }
      return result;
    }).finally(() => {
      currentEmployeeRequest = null;
    });
  }
  return currentEmployeeRequest;
}

export async function getAccessToken({ forceRefresh = false } = {}) {
  const supabase = supabaseBrowser();
  const { data: { session: storedSession } = {}, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return null;

  const expiresAt = Number(storedSession?.expires_at || 0);
  const refreshRequired = forceRefresh || (expiresAt > 0 && expiresAt <= Math.floor(Date.now() / 1000) + 30);
  let session = storedSession;
  if (refreshRequired && storedSession) {
    const { data: { session: refreshedSession } = {}, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) return null;
    session = refreshedSession;
    if (session?.access_token) syncAuthSession(session);
  }
  if (session?.access_token) {
    syncAuthSession(session);
    return session.access_token;
  }
  return null;
}

export function canCreateTasks(role) {
  return ['super_admin', 'assigner', 'ea'].includes(role);
}
