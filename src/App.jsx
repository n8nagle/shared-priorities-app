import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const BOARD_TYPE_OPTIONS = [
  { value: "home_projects", label: "Home Projects" },
  { value: "purchases", label: "Purchases" },
  { value: "meal_ideas", label: "Meal Ideas" },
  { value: "custom", label: "Custom" },
];

export default function App() {
  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    displayName: "",
  });

  const [profile, setProfile] = useState(null);
  const [household, setHousehold] = useState(null);
  const [board, setBoard] = useState(null);

  const [setupForm, setSetupForm] = useState({
    householdName: "",
    boardType: "home_projects",
  });
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    }

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setHousehold(null);
      setBoard(null);
      return;
    }

    loadAppState();
  }, [user]);

  async function loadAppState() {
    setLoading(true);
    setAuthError("");
    setSetupError("");

    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      const { data: memberData, error: memberError } = await supabase
        .from("household_members")
        .select(
          `
          household_id,
          role,
          households (
            id,
            name,
            created_by,
            created_at
          )
        `
        )
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (memberError) throw memberError;

      if (!memberData) {
        setHousehold(null);
        setBoard(null);
        setLoading(false);
        return;
      }

      setHousehold(memberData.households);

      const { data: boardData, error: boardError } = await supabase
        .from("boards")
        .select("*")
        .eq("household_id", memberData.household_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (boardError) throw boardError;

      setBoard(boardData ?? null);
    } catch (error) {
      console.error(error);
      setAuthError(error.message || "Failed to load app state.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthMessage("");

    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: authForm.email.trim(),
          password: authForm.password,
          options: {
            data: {
              display_name: authForm.displayName.trim(),
            },
          },
        });

        if (error) throw error;

        setAuthMessage(
          "Account created. If email confirmation is enabled in Supabase, check your inbox."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authForm.email.trim(),
          password: authForm.password,
        });

        if (error) throw error;
      }
    } catch (error) {
      console.error(error);
      setAuthError(error.message || "Authentication failed.");
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  async function handleSetupSubmit(e) {
    e.preventDefault();
    setSetupError("");

    const householdName = setupForm.householdName.trim();
    if (!householdName) {
      setSetupError("Please enter a household name.");
      return;
    }

    setSetupLoading(true);

    try {
      const { data: householdInsert, error: householdError } = await supabase
        .from("households")
        .insert({
          name: householdName,
          created_by: user.id,
        })
        .select()
        .single();

      if (householdError) throw householdError;

      const { error: memberError } = await supabase
        .from("household_members")
        .insert({
          household_id: householdInsert.id,
          user_id: user.id,
          role: "owner",
        });

      if (memberError) throw memberError;

      const selectedBoardLabel =
        BOARD_TYPE_OPTIONS.find(
          (option) => option.value === setupForm.boardType
        )?.label ?? "Custom";

      const { error: boardError } = await supabase.from("boards").insert({
        household_id: householdInsert.id,
        title: selectedBoardLabel,
        board_type: setupForm.boardType,
        is_active: true,
      });

      if (boardError) throw boardError;

      await loadAppState();
    } catch (error) {
      console.error(error);
      setSetupError(error.message || "Failed to create setup.");
    } finally {
      setSetupLoading(false);
    }
  }

  if (loading) {
    return (
      <>
        <div className="app-shell">
          <div className="card">Loading...</div>
        </div>
        <style>{styles}</style>
      </>
    );
  }

  if (!session || !user) {
    return (
      <>
        <div className="app-shell">
          <div className="card auth-card">
            <h1>Shared Priorities</h1>
            <p className="muted">
              Rank what matters most together.
            </p>

            <div className="auth-toggle">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                  setAuthMessage("");
                }}
              >
                Log In
              </button>
              <button
                type="button"
                className={authMode === "signup" ? "active" : ""}
                onClick={() => {
                  setAuthMode("signup");
                  setAuthError("");
                  setAuthMessage("");
                }}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="stack">
              {authMode === "signup" && (
                <label>
                  Display Name
                  <input
                    value={authForm.displayName}
                    onChange={(e) =>
                      setAuthForm((prev) => ({
                        ...prev,
                        displayName: e.target.value,
                      }))
                    }
                    placeholder="Nate"
                  />
                </label>
              )}

              <label>
                Email
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(e) =>
                    setAuthForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  placeholder="you@example.com"
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(e) =>
                    setAuthForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  placeholder="Password"
                />
              </label>

              {authError && <div className="error">{authError}</div>}
              {authMessage && <div className="success">{authMessage}</div>}

              <button type="submit" className="primary">
                {authMode === "signup" ? "Create Account" : "Log In"}
              </button>
            </form>
          </div>
        </div>
        <style>{styles}</style>
      </>
    );
  }

  if (!household || !board) {
    return (
      <>
        <div className="app-shell">
          <div className="card">
            <div className="top-row">
              <div>
                <h1>Choose your board type</h1>
                <p className="muted">
                  Start with one board. Keep it focused.
                </p>
              </div>
              <button type="button" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>

            <form onSubmit={handleSetupSubmit} className="stack">
              <label>
                Household Name
                <input
                  value={setupForm.householdName}
                  onChange={(e) =>
                    setSetupForm((prev) => ({
                      ...prev,
                      householdName: e.target.value,
                    }))
                  }
                  placeholder="Nate & Amanda"
                />
              </label>

              <div>
                <div className="field-label">Board Type</div>
                <div className="board-grid">
                  {BOARD_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        setupForm.boardType === option.value
                          ? "board-option active"
                          : "board-option"
                      }
                      onClick={() =>
                        setSetupForm((prev) => ({
                          ...prev,
                          boardType: option.value,
                        }))
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {setupError && <div className="error">{setupError}</div>}

              <button
                type="submit"
                className="primary"
                disabled={setupLoading}
              >
                {setupLoading ? "Creating..." : "Create Board"}
              </button>
            </form>
          </div>
        </div>
        <style>{styles}</style>
      </>
    );
  }

  return (
    <>
      <div className="app-shell">
        <div className="card">
          <div className="top-row">
            <div>
              <div className="eyebrow">{household.name}</div>
              <h1>{board.title}</h1>
              <p className="muted">
                Logged in as {profile?.display_name || user.email}
              </p>
            </div>

            <button type="button" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Setup complete</h2>
          <p className="muted">
            You now have a household and your first board.
          </p>
          <p>
            Next up: items, ratings, ranking, and the focused grid.
          </p>
        </div>

        {authError && <div className="error">{authError}</div>}
      </div>
      <style>{styles}</style>
    </>
  );
}

const styles = `
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: Inter, system-ui, sans-serif;
    background: #0b1727;
    color: #f4f7fb;
  }

  button,
  input {
    font: inherit;
  }

  .app-shell {
    max-width: 760px;
    margin: 0 auto;
    padding: 16px;
    display: grid;
    gap: 16px;
  }

  .card {
    background: #11243b;
    border: 1px solid #233b58;
    border-radius: 20px;
    padding: 16px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  }

  .auth-card {
    margin-top: 48px;
  }

  h1, h2, p {
    margin-top: 0;
  }

  .muted {
    color: #9cb1ca;
  }

  .eyebrow {
    color: #8ea8c6;
    font-size: 0.9rem;
    margin-bottom: 4px;
  }

  .stack {
    display: grid;
    gap: 12px;
  }

  label {
    display: grid;
    gap: 6px;
    font-weight: 600;
  }

  .field-label {
    font-weight: 600;
    margin-bottom: 8px;
  }

  input {
    width: 100%;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid #335070;
    background: #0d1d31;
    color: #f4f7fb;
  }

  button {
    border: 1px solid #335070;
    background: #18304c;
    color: #f4f7fb;
    border-radius: 12px;
    padding: 10px 14px;
    cursor: pointer;
  }

  button.primary {
    background: #f0a329;
    color: #102235;
    border: none;
    font-weight: 700;
  }

  button:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .auth-toggle {
    display: flex;
    gap: 8px;
    margin: 16px 0;
  }

  .auth-toggle button.active,
  .board-option.active {
    background: #f0a329;
    color: #102235;
    border-color: transparent;
    font-weight: 700;
  }

  .top-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .board-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .board-option {
    min-height: 56px;
    text-align: left;
  }

  .error {
    background: rgba(255, 95, 95, 0.16);
    color: #ffd4d4;
    border: 1px solid rgba(255, 95, 95, 0.35);
    padding: 10px 12px;
    border-radius: 12px;
  }

  .success {
    background: rgba(72, 187, 120, 0.16);
    color: #d7ffe5;
    border: 1px solid rgba(72, 187, 120, 0.35);
    padding: 10px 12px;
    border-radius: 12px;
  }

  @media (max-width: 640px) {
    .top-row {
      display: grid;
    }

    .board-grid {
      grid-template-columns: 1fr;
    }

    .auth-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
  }
`;
