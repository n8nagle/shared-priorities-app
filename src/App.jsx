import { useEffect, useMemo, useState } from "react";
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

  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [showAllGridItems, setShowAllGridItems] = useState(false);

  const [itemTitle, setItemTitle] = useState("");
  const [itemError, setItemError] = useState("");
  const [itemMessage, setItemMessage] = useState("");
  const [addingItem, setAddingItem] = useState(false);

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
      setItems([]);
      setSelectedItemId(null);
      return;
    }

    loadAppState();
  }, [user]);

  async function loadAppState() {
    setLoading(true);
    setAuthError("");
    setSetupError("");
    setItemError("");
    setItemMessage("");

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
        setItems([]);
        setSelectedItemId(null);
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

      if (!boardData) {
        setItems([]);
        setSelectedItemId(null);
        setLoading(false);
        return;
      }

      await loadBoardItems(boardData.id);
    } catch (error) {
      console.error(error);
      setAuthError(error.message || "Failed to load app state.");
    } finally {
      setLoading(false);
    }
  }

  async function loadBoardItems(boardId) {
    const { data, error } = await supabase
      .from("items")
      .select(
        `
        *,
        ratings (
          id,
          item_id,
          user_id,
          impact,
          effort,
          created_at,
          updated_at
        )
      `
      )
      .eq("board_id", boardId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const hydrated = (data ?? []).map((item) => hydrateItem(item));
    hydrated.sort(sortItems);

    setItems(hydrated);

    setSelectedItemId((prev) => {
      if (prev && hydrated.some((item) => item.id === prev)) return prev;
      return hydrated[0]?.id ?? null;
    });
  }

  function hydrateItem(item) {
    const ratings = item.ratings ?? [];

    const impactValues = ratings.map((r) => r.impact);
    const effortValues = ratings.map((r) => r.effort);

    const avgImpact = impactValues.length
      ? impactValues.reduce((sum, value) => sum + value, 0) / impactValues.length
      : null;

    const avgEffort = effortValues.length
      ? effortValues.reduce((sum, value) => sum + value, 0) / effortValues.length
      : null;

    const score =
      avgImpact !== null && avgEffort !== null ? avgImpact * 3 - avgEffort : null;

    const currentUserRating =
      ratings.find((rating) => rating.user_id === user.id) ?? null;

    const partnerRatings = ratings.filter((rating) => rating.user_id !== user.id);
    const partnerRating = partnerRatings[0] ?? null;

    const impactDiff =
      currentUserRating && partnerRating
        ? Math.abs(currentUserRating.impact - partnerRating.impact)
        : null;

    const effortDiff =
      currentUserRating && partnerRating
        ? Math.abs(currentUserRating.effort - partnerRating.effort)
        : null;

    return {
      ...item,
      avgImpact,
      avgEffort,
      score,
      currentUserRating,
      partnerRating,
      impactDiff,
      effortDiff,
      quadrantLabel: getQuadrantLabel(avgImpact, avgEffort),
    };
  }

  function sortItems(a, b) {
    if (a.is_completed !== b.is_completed) {
      return a.is_completed ? 1 : -1;
    }

    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;

    return b.score - a.score;
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

  async function handleAddItem(e) {
    e.preventDefault();
    setItemError("");
    setItemMessage("");

    const title = itemTitle.trim();
    if (!title) {
      setItemError("Please enter an item name.");
      return;
    }

    setAddingItem(true);

    try {
      const { error } = await supabase.from("items").insert({
        board_id: board.id,
        title,
        created_by: user.id,
      });

      if (error) throw error;

      setItemTitle("");
      setItemMessage("Item added.");
      await loadBoardItems(board.id);
    } catch (error) {
      console.error(error);
      setItemError(error.message || "Failed to add item.");
    } finally {
      setAddingItem(false);
    }
  }

  async function saveRating(item, field, value) {
    setItemError("");
    setItemMessage("");

    const existing = item.currentUserRating;

    const payload = {
      item_id: item.id,
      user_id: user.id,
      impact: existing?.impact ?? 3,
      effort: existing?.effort ?? 3,
      [field]: value,
    };

    try {
      const { error } = await supabase.from("ratings").upsert(payload, {
        onConflict: "item_id,user_id",
      });

      if (error) throw error;

      await loadBoardItems(board.id);
    } catch (error) {
      console.error(error);
      setItemError(error.message || "Failed to save rating.");
    }
  }

  async function toggleComplete(item) {
    setItemError("");
    setItemMessage("");

    try {
      const nextCompleted = !item.is_completed;

      const { error } = await supabase
        .from("items")
        .update({
          is_completed: nextCompleted,
          completed_at: nextCompleted ? new Date().toISOString() : null,
        })
        .eq("id", item.id);

      if (error) throw error;

      await loadBoardItems(board.id);
    } catch (error) {
      console.error(error);
      setItemError(error.message || "Failed to update item.");
    }
  }

  const selectedItem = useMemo(() => {
    return items.find((item) => item.id === selectedItemId) ?? null;
  }, [items, selectedItemId]);

  const gridItems = useMemo(() => {
    if (!showAllGridItems) return [];
    return items.filter(
      (item) =>
        item.avgImpact !== null && item.avgEffort !== null && !item.is_completed
    );
  }, [items, showAllGridItems]);

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
            <p className="muted">Rank what matters most together.</p>

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
                <p className="muted">Start with one board. Keep it focused.</p>
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
          <h2>Add Item</h2>
          <form onSubmit={handleAddItem} className="inline-form">
            <input
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              placeholder="Add a new item..."
            />
            <button type="submit" className="primary" disabled={addingItem}>
              {addingItem ? "Adding..." : "Add"}
            </button>
          </form>

          {itemError && <div className="error top-gap">{itemError}</div>}
          {itemMessage && <div className="success top-gap">{itemMessage}</div>}
        </div>

        <div className="card">
          <div className="top-row">
            <h2>Focused Grid</h2>
            <button
              type="button"
              onClick={() => setShowAllGridItems((prev) => !prev)}
            >
              {showAllGridItems ? "Show Selected Only" : "Show All Items"}
            </button>
          </div>

          {!selectedItem ? (
            <p className="muted">Add your first item to get started.</p>
          ) : (
            <div className="stack">
              <div className="selected-header">
                <div>
                  <div className="selected-title">{selectedItem.title}</div>
                  <div className="muted">
                    {selectedItem.score === null
                      ? "Needs rating"
                      : `Score ${selectedItem.score.toFixed(1)} • ${selectedItem.quadrantLabel}`}
                  </div>
                </div>

                <button type="button" onClick={() => toggleComplete(selectedItem)}>
                  {selectedItem.is_completed ? "Mark Active" : "Mark Complete"}
                </button>
              </div>

              <div className="focus-grid">
                <div className="focus-box">
                  <div className="quadrant top-left">Quick Win</div>
                  <div className="quadrant top-right">Big Investment</div>
                  <div className="quadrant bottom-left">Low-Stakes</div>
                  <div className="quadrant bottom-right">Probably Skip</div>

                  {gridItems.map((item) => (
                    <MiniDot
                      key={item.id}
                      x={item.avgEffort}
                      y={item.avgImpact}
                      selected={item.id === selectedItem.id}
                      label={item.title}
                    />
                  ))}

                  {selectedItem.currentUserRating && (
                    <Dot
                      label="You"
                      x={selectedItem.currentUserRating.effort}
                      y={selectedItem.currentUserRating.impact}
                      variant="you"
                    />
                  )}

                  {selectedItem.partnerRating && (
                    <Dot
                      label="Partner"
                      x={selectedItem.partnerRating.effort}
                      y={selectedItem.partnerRating.impact}
                      variant="partner"
                    />
                  )}

                  {selectedItem.avgImpact !== null &&
                    selectedItem.avgEffort !== null && (
                      <Dot
                        label="Avg"
                        x={selectedItem.avgEffort}
                        y={selectedItem.avgImpact}
                        variant="avg"
                      />
                    )}
                </div>

                <div className="focus-meta">
                  <div>
                    <strong>Quadrant:</strong> {selectedItem.quadrantLabel}
                  </div>
                  <div>
                    <strong>Your Impact:</strong>{" "}
                    {formatMaybe(selectedItem.currentUserRating?.impact)}
                  </div>
                  <div>
                    <strong>Your Effort:</strong>{" "}
                    {formatMaybe(selectedItem.currentUserRating?.effort)}
                  </div>
                  <div>
                    <strong>Avg Impact:</strong>{" "}
                    {formatMaybe(selectedItem.avgImpact)}
                  </div>
                  <div>
                    <strong>Avg Effort:</strong>{" "}
                    {formatMaybe(selectedItem.avgEffort)}
                  </div>
                  <div>
                    <strong>Impact Diff:</strong>{" "}
                    {formatMaybe(selectedItem.impactDiff)}
                  </div>
                  <div>
                    <strong>Effort Diff:</strong>{" "}
                    {formatMaybe(selectedItem.effortDiff)}
                  </div>
                </div>
              </div>

              <RatingRow
                label="Impact"
                value={selectedItem.currentUserRating?.impact ?? null}
                onSelect={(value) => saveRating(selectedItem, "impact", value)}
              />

              <RatingRow
                label="Effort"
                value={selectedItem.currentUserRating?.effort ?? null}
                onSelect={(value) => saveRating(selectedItem, "effort", value)}
              />
            </div>
          )}
        </div>

        <div className="card">
          <h2>Ranked Items</h2>

          {items.length === 0 ? (
            <p className="muted">No items yet.</p>
          ) : (
            <div className="item-list">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`item-row ${selectedItemId === item.id ? "selected" : ""} ${
                    item.is_completed ? "completed" : ""
                  }`}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <div className="item-rank">{index + 1}</div>
                  <div className="item-main">
                    <div className="item-title">{item.title}</div>
                    <div className="item-sub muted">
                      {item.score === null
                        ? "Needs rating"
                        : `Score ${item.score.toFixed(1)} • ${item.quadrantLabel}`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {authError && <div className="error">{authError}</div>}
      </div>

      <style>{styles}</style>
    </>
  );
}

function RatingRow({ label, value, onSelect }) {
  return (
    <div className="rating-row">
      <div className="field-label">{label}</div>
      <div className="rating-buttons">
        {[1, 2, 3, 4, 5].map((number) => (
          <button
            key={number}
            type="button"
            className={value === number ? "rating-btn active" : "rating-btn"}
            onClick={() => onSelect(number)}
          >
            {number}
          </button>
        ))}
      </div>
    </div>
  );
}

function Dot({ x, y, label, variant }) {
  const left = `${((x - 1) / 4) * 100}%`;
  const bottom = `${((y - 1) / 4) * 100}%`;

  return (
    <div
      className={`dot ${variant}`}
      style={{ left, bottom }}
      title={label}
    >
      <span>{label}</span>
    </div>
  );
}

function MiniDot({ x, y, selected, label }) {
  const left = `${((x - 1) / 4) * 100}%`;
  const bottom = `${((y - 1) / 4) * 100}%`;

  return (
    <div
      className={`mini-dot ${selected ? "selected" : ""}`}
      style={{ left, bottom }}
      title={label}
    />
  );
}

function formatMaybe(value) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? value : value.toFixed(1);
}

function getQuadrantLabel(avgImpact, avgEffort) {
  if (avgImpact === null || avgEffort === null) return "Unrated";

  const highImpact = avgImpact >= 3;
  const highEffort = avgEffort >= 3;

  if (highImpact && !highEffort) return "Quick Win";
  if (highImpact && highEffort) return "Big Investment";
  if (!highImpact && !highEffort) return "Low-Stakes";
  return "Probably Skip";
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
    font-weight: 700;
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
  .board-option.active,
  .rating-btn.active,
  .item-row.selected {
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

  .inline-form {
    display: flex;
    gap: 10px;
  }

  .inline-form input {
    flex: 1;
  }

  .top-gap {
    margin-top: 12px;
  }

  .selected-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .selected-title {
    font-size: 1.15rem;
    font-weight: 800;
  }

  .focus-grid {
    display: grid;
    gap: 12px;
  }

  .focus-box {
    position: relative;
    height: 320px;
    border-radius: 18px;
    border: 1px solid #335070;
    background:
      linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
      linear-gradient(to top, rgba(255,255,255,0.06) 1px, transparent 1px),
      #0d1d31;
    background-size: 25% 25%;
    overflow: hidden;
  }

  .quadrant {
    position: absolute;
    font-size: 0.78rem;
    color: #7f96b2;
    font-weight: 700;
    pointer-events: none;
  }

  .top-left {
    top: 10px;
    left: 10px;
  }

  .top-right {
    top: 10px;
    right: 10px;
  }

  .bottom-left {
    bottom: 10px;
    left: 10px;
  }

  .bottom-right {
    bottom: 10px;
    right: 10px;
  }

  .dot {
    position: absolute;
    transform: translate(-50%, 50%);
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 2px solid white;
    z-index: 3;
  }

  .dot span {
    position: absolute;
    top: -22px;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 0.75rem;
    color: #d9e4f2;
  }

  .dot.you {
    background: #4ea1ff;
  }

  .dot.partner {
    background: #ff6262;
  }

  .dot.avg {
    background: #f0a329;
  }

  .mini-dot {
    position: absolute;
    transform: translate(-50%, 50%);
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: rgba(220, 233, 247, 0.45);
    border: 1px solid rgba(255,255,255,0.25);
    z-index: 1;
  }

  .mini-dot.selected {
    width: 14px;
    height: 14px;
    background: rgba(240, 163, 41, 0.8);
    border-color: rgba(255,255,255,0.5);
    z-index: 2;
  }

  .focus-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .rating-row {
    display: grid;
    gap: 8px;
  }

  .rating-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .rating-btn {
    min-width: 44px;
    min-height: 44px;
  }

  .item-list {
    display: grid;
    gap: 10px;
  }

  .item-row {
    width: 100%;
    text-align: left;
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: 12px;
    align-items: center;
    background: #0d1d31;
  }

  .item-rank {
    font-size: 1.2rem;
    font-weight: 800;
    text-align: center;
  }

  .item-title {
    font-weight: 700;
  }

  .item-sub {
    font-size: 0.9rem;
    margin-top: 4px;
  }

  .item-row.completed {
    opacity: 0.6;
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
    .top-row,
    .selected-header,
    .inline-form {
      display: grid;
    }

    .board-grid {
      grid-template-columns: 1fr;
    }

    .auth-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .focus-meta {
      grid-template-columns: 1fr;
    }
  }
`;
