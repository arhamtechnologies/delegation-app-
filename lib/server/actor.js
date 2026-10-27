// Shared plumbing for rule functions that both API routes and the WhatsApp bot call.
// A rule returns { ok: true, body } or { ok: false, status, error }; routes turn that into the same JSON they always sent.

/** @typedef {{ employeeId: string, role: string, authUserId: string, name: string }} Actor */

/** @returns {Actor} */
export function actorFromAuthorization({ user, employee }) {
  return { employeeId: employee.id, role: employee.role, authUserId: user.id, name: employee.name };
}

/** Actor in the employee-row shape older helpers expect ({ id, name, role }). */
export function actorEmployee(actor) {
  return { id: actor.employeeId, name: actor.name, role: actor.role };
}

export function done(body) {
  return { ok: true, body };
}

export function fail(error, status) {
  return { ok: false, status, error };
}

export function ruleResponse(result) {
  return result.ok ? Response.json(result.body) : Response.json({ success: false, error: result.error }, { status: result.status });
}
