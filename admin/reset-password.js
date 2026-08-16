const config = window.ROADREACH_CONFIG || {};
const db = config.supabaseUrl && config.supabasePublishableKey && window.supabase
  ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey) : null;
const form = document.querySelector("#resetPasswordForm");
const status = document.querySelector("#resetStatus");
const statusMessage = document.querySelector("#resetStatusMessage");
const formMessage = document.querySelector("#resetPasswordMessage");
const callbackType = new URLSearchParams(window.location.hash.slice(1)).get("type");
let recoverySession = null;

function message(node, text, error = false) { node.textContent = text; node.classList.toggle("error", error); }
function showRecovery(session) {
  if (!session?.user) return false;
  recoverySession = session;
  status.hidden = true;
  form.hidden = false;
  message(formMessage, "Choose a new password.");
  return true;
}
function showUnavailable(text) { form.hidden = true; status.hidden = false; message(statusMessage, text, true); }

if (!db) showUnavailable("Supabase runtime configuration is missing. Return to the administrator sign-in page and contact the site owner.");
else {
  db.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") showRecovery(session);
  });
  const { data, error } = await db.auth.getSession();
  if (error) showUnavailable("Unable to read the password recovery session. Please request a new recovery email.");
  else if (!showRecovery(data.session)) {
    const reason = callbackType === "recovery" ? "The recovery link did not create a secure session. Please request a new recovery email." : "Open this page from the password recovery email to set a new password.";
    showUnavailable(reason);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fields = new FormData(form);
  const password = String(fields.get("password") || "");
  const confirmPassword = String(fields.get("confirmPassword") || "");
  if (!recoverySession) { message(formMessage, "The recovery session is unavailable. Please request a new recovery email.", true); return; }
  if (password.length < 12) { message(formMessage, "Use at least 12 characters for the new password.", true); return; }
  if (password !== confirmPassword) { message(formMessage, "Passwords do not match.", true); return; }
  message(formMessage, "Saving password…");
  const { error } = await db.auth.updateUser({ password });
  if (error) { console.error("Password update failed", error); message(formMessage, error.message, true); return; }
  message(formMessage, "Password updated successfully.");
  window.setTimeout(() => window.location.replace("./"), 700);
});
