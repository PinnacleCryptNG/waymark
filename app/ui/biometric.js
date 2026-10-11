// Fingerprint (or face) approval using the phone's own unlock, through WebAuthn.
// Nothing is spoken, typed or overheard: the phone checks the finger and answers yes or no.
//
// Demo boundary: a real bank would send a fresh challenge from its server and verify the
// signed answer there. This prototype has no server, so it only checks that the phone
// confirmed the user. Say so wherever it matters.

const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const toBase64Url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** True when this phone and browser can approve with a built-in fingerprint or face unlock. */
export async function biometricAvailable() {
  try {
    return Boolean(window.PublicKeyCredential
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

/** Plain-language reason for a failed or cancelled attempt. */
function reason(error) {
  if (error?.name === 'NotAllowedError') return 'cancelled';
  if (error?.name === 'InvalidStateError') return 'already-registered';
  return 'unavailable';
}

/** Register this phone's fingerprint for the demo. Resolves to { ok, credentialId } or { ok: false, reason }. */
export async function registerBiometric() {
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'WAYMARK demo' },
        user: { id: randomBytes(16), name: 'waymark-demo-user', displayName: 'WAYMARK demo user' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        attestation: 'none',
        timeout: 60000,
      },
    });
    return { ok: true, credentialId: toBase64Url(credential.rawId) };
  } catch (error) {
    return { ok: false, reason: reason(error) };
  }
}

/** Ask the user to touch the sensor. Resolves to { ok: true } or { ok: false, reason }. */
export async function verifyBiometric(credentialId) {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(credentialId) }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return assertion ? { ok: true } : { ok: false, reason: 'cancelled' };
  } catch (error) {
    return { ok: false, reason: reason(error) };
  }
}
