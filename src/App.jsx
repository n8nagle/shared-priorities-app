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
  const [memberRole, setMemberRole] = useState(null);

  const [boards, setBoards] = useState([]);
  const [selectedBoardId, setSelectedBoardId] = useState(null);
  const [showBoardHub, setShowBoardHub] = useState(false);

  const [setupMode, setSetupMode] = useState("create");
  const [setupForm, setSetupForm] = useState({
    householdName: "",
    boardType: "home_projects",
  });
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const [createBoardForm, setCreateBoardForm] = useState({
    title: "",
    boardType: "custom",
  });
  const [createBoardLoading, setCreateBoardLoading] = useState(false);
  const [createBoardError, setCreateBoardError] = useState("");

  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [showAllGridItems, setShowAllGridItems] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const [itemTitle, setItemTitle] = useState("");
  const [itemError, setItemError] = useState("");
  const [itemMessage, setItemMessage] = useState("");
  const [addingItem, setAddingItem] = useState(false);

  const [inviteCode, setInviteCode] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

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
      setMemberRole(null);
      setBoards([]);
      setSelectedBoardId(null);
      setItems([]);
      setSelectedItemId(null);
      setShowBoardHub(false);
      return;
    }

    loadAppState();
  }, [user]);

  useEffect(() => {
    if (!selectedBoardId) {
      setItems([]);
      setSelectedItemId(null);
      return;
    }

    loadBoardItems(selectedBoardId);
  }, [selectedBoardId]);

  async function loadAppState() {
    setLoading(true);
    setAuthError("");
    setSetupError("");
    setItemError("");
    setItemMessage("");
    setInviteError("");
    setInviteMessage("");
    setCreateBoardError("");

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
        setMemberRole(null);
        setBoards([]);
        setSelectedBoardId(null);
        setItems([]);
        setSelectedItemId(null);
        setShowBoardHub(false);
        setLoading(false);
        return;
      }

      setHousehold(memberData.households);
      setMemberRole(memberData.role);

      await loadBoards(memberData.household_id);
    } catch (error) {
      console.error(error);
      setAuthError(error.message || "Failed to load app state.");
    } finally {
      setLoading(false);
    }
  }

  async function loadBoards(householdId) {
    const { data, error } = await supabase
      .from("boards")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const nextBoards = data ?? [];
    setBoards(nextBoards);

    setSelectedBoardId((prev) => {
      if (prev && nextBoards.some((board) => board.id === prev)) return prev;
      return nextBoards[0]?.id ?? null;
    });

    if (nextBoards.length === 0) {
      setShowBoardHub(true);
    }
  }

  async function loadBoardItems(boardId) {
    try {
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
        return hydrated.find((item) => !item.is_completed)?.id ?? hydrated[0]?.id ?? null;
      });
    } catch (error) {
      console.error(error);
      setItemError(error.message || "Failed to load items.");
    }
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

    if (setupMode === "join") {
      const code = joinCode.trim();
      if (!code) {
        setSetupError("Please enter an invite code.");
        return;
      }

      setSetupLoading(true);

      try {
        const { error } = await supabase.rpc("join_household_by_code", {
          _token: code,
        });

        if (error) throw error;

        await loadAppState();
      } catch (error) {
        console.error(error);
        setSetupError(error.message || "Failed to join household.");
      } finally {
        setSetupLoading(false);
      }

      return;
    }

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

      const { data: boardInsert, error: boardError } = await supabase
        .from("boards")
        .insert({
          household_id: householdInsert.id,
          title: selectedBoardLabel,
          board_type: setupForm.boardType,
          is_active: true,
        })
        .select()
        .single();

      if (boardError) throw boardError;

      await loadAppState();
      setSelectedBoardId(boardInsert.id);
      setShowBoardHub(false);
    } catch (error) {
      console.error(error);
      setSetupError(error.message || "Failed to create setup.");
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleCreateBoard(e) {
    e.preventDefault();
    setCreateBoardError("");

    const title =
      createBoardForm.title.trim() ||
      BOARD_TYPE_OPTIONS.find((option) => option.value === createBoardForm.boardType)?.label ||
      "New Board";

    setCreateBoardLoading(true);

    try {
      const { data, error } = await supabase
        .from("boards")
        .insert({
          household_id: household.id,
          title,
          board_type: createBoardForm.boardType,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      await loadBoards(household.id);
      setSelectedBoardId(data.id);
      setCreateBoardForm({
        title: "",
        boardType: "custom",
      });
      setShowBoardHub(false);
    } catch (error) {
      console.error(error);
      setCreateBoardError(error.message || "Failed to create board.");
    } finally {
      setCreateBoardLoading(false);
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
        board_id: selectedBoardId,
        title,
        created_by: user.id,
      });

      if (error) throw error;

      setItemTitle("");
      setItemMessage("Item added.");
      await loadBoardItems(selectedBoardId);
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

      await loadBoardItems(selectedBoardId);
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

      await loadBoardItems(selectedBoardId);
    } catch (error) {
      console.error(error);
      setItemError(error.message || "Failed to update item.");
    }
  }

  async function generateInviteCode() {
    setInviteError("");
    setInviteMessage("");
    setInviteLoading(true);

    try {
      const { data, error } = await supabase.rpc("create_household_invite", {
        _household_id: household.id,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      setInviteCode(row?.token || "");
      setInviteMessage("Invite code generated.");
    } catch (error) {
      console.error(error);
      setInviteError(error.message || "Failed to generate invite code.");
    } finally {
      setInviteLoading(false);
    }
  }

  const selectedBoard = useMemo(() => {
    return boards.find((board) => board.id === selectedBoardId) ?? null;
  }, [boards, selectedBoardId]);

  const selectedItem = useMemo(() => {
    return items.find((item) => item.id === selectedItemId) ?? null;
  }, [items, selectedItemId]);

  const activeItems = useMemo(() => items.filter((item) => !item.is_completed), [items]);
  const completedItems = useMemo(() => items.filter((item) => item.is_completed), [items]);

  const gridItems = useMemo(() => {
    if (!showAllGridItems) return [];
    return activeItems.filter(
      (item) => item.avgImpact !== null && item.avgEffort !== null
    );
  }, [activeItems, showAllGridItems]);

  const selectedDots = useMemo(() => {
    if (!selectedItem) return [];

    const rawDots = [];

    if (selectedItem.currentUserRating) {
      rawDots.push({
        key: "you",
        label: "You",
        x: selectedItem.currentUserRating.effort,
        y: selectedItem.currentUserRating.impact,
        variant: "you",
      });
    }

    if (selectedItem.partnerRating) {
      rawDots.push({
        key: "partner",
        label: "Partner",
        x: selectedItem.partnerRating.effort,
        y: selectedItem.partnerRating.impact,
        variant: "partner",
      });
    }

    if (selectedItem.avgImpact !== null && selectedItem.avgEffort !== null) {
      rawDots.push({
        key: "avg",
        label: "Avg",
        x: selectedItem.avgEffort,
        y: selectedItem.avgImpact,
        variant: "avg",
      });
    }

    const counts = {};
    return rawDots.map((dot) => {
      const key = `${dot.x}-${dot.y}`;
      const offsetIndex = counts[key] ?? 0;
      counts[key] = offsetIndex + 1;
      return { ...dot, offsetIndex };
    });
  }, [selectedItem]);

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

  if (!household) {
    return (
      <>
        <div className="app-shell">
          <div className="card">
            <div className="top-row">
              <div>
                <h1>{setupMode === "create" ? "Choose your board type" : "Join a household"}</h1>
                <p className="muted">
                  {setupMode === "create"
                    ? "Start with one board. Keep it focused."
                    : "Enter the invite code from your partner."}
                </p>
              </div>
              <button type="button" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>

            <div className="auth-toggle">
              <button
                type="button"
                className={setupMode === "create" ? "active" : ""}
                onClick={() => {
                  setSetupMode("create");
                  setSetupError("");
                }}
              >
                Create
              </button>
              <button
                type="button"
                className={setupMode === "join" ? "active" : ""}
                onClick={() => {
                  setSetupMode("join");
                  setSetupError("");
                }}
              >
                Join
              </button>
            </div>

            <form onSubmit={handleSetupSubmit} className="stack">
              {setupMode === "create" ? (
                <>
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
                </>
              ) : (
                <label>
                  Invite Code
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="Paste code here"
                  />
                </label>
              )}

              {setupError && <div className="error">{setupError}</div>}

              <button
                type="submit"
                className="primary"
                disabled={setupLoading}
              >
                {setupLoading
                  ? "Working..."
                  : setupMode === "create"
                  ? "Create Board"
                  : "Join Household"}
              </button>
            </form>
          </div>
        </div>
        <style>{styles}</style>
      </>
    );
  }

  if (showBoardHub || !selectedBoard) {
    return (
      <>
        <div className="app-shell">
          <div className="card">
            <div className="top-row">
              <div>
                <div className="eyebrow">{household.name}</div>
                <h1>Boards</h1>
                <p className="muted">
                  Choose a board or create a new one.
                </p>
              </div>
              <button type="button" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Your Boards</h2>

            {boards.length === 0 ? (
              <p className="muted">No boards yet.</p>
            ) : (
              <div className="board-list">
                {boards.map((board) => (
                  <button
                    key={board.id}
                    type="button"
                    className="board-list-item"
                    onClick={() => {
                      setSelectedBoardId(board.id);
                      setShowBoardHub(false);
                    }}
                  >
                    <div className="board-list-title">{board.title}</div>
                    <div className="muted">{humanizeBoardType(board.board_type)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2>Create Board</h2>
            <form onSubmit={handleCreateBoard} className="stack">
              <label>
                Board Title
                <input
                  value={createBoardForm.title}
                  onChange={(e) =>
                    setCreateBoardForm((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  placeholder="Bathroom Remodel"
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
                        createBoardForm.boardType === option.value
                          ? "board-option active"
                          : "board-option"
                      }
                      onClick={() =>
                        setCreateBoardForm((prev) => ({
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

              {createBoardError && <div className="error">{createBoardError}</div>}

              <button type="submit" className="primary" disabled={createBoardLoading}>
                {createBoardLoading ? "Creating..." : "Create Board"}
              </button>
            </form>
          </div>

          <style>{styles}</style>
        </div>
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
              <h1>{selectedBoard.title}</h1>
              <p className="muted">
                Logged in as {profile?.display_name || user.email}
              </p>
            </div>

            <div className="header-actions">
              <button type="button" onClick={() => setShowBoardHub(true)}>
                Boards
              </button>
              <button type="button" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="top-row">
            <div>
              <h2>Invite Partner</h2>
              <p className="muted">
                Share a one-time code so your partner can join this household.
              </p>
            </div>
            <button
              type="button"
              onClick={generateInviteCode}
              disabled={inviteLoading}
            >
              {inviteLoading ? "Generating..." : "Generate Code"}
            </button>
          </div>

          {inviteCode && (
            <div className="invite-code-box">
              <div className="invite-code-label">Invite Code</div>
              <div className="invite-code">{inviteCode}</div>
            </div>
          )}

          {inviteError && <div className="error top-gap">{inviteError}</div>}
          {inviteMessage && <div className="success top-gap">{inviteMessage}</div>}
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

        <div className="card selected-card">
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
                  <div className="quadrant bottom-right">Save for Later</div>

                  {gridItems.map((item) => (
                    <MiniDot
                      key={item.id}
                      x={item.avgEffort}
                      y={item.avgImpact}
                      selected={item.id === selectedItem.id}
                      label={item.title}
                    />
                  ))}

                  {selectedDots.map((dot) => (
                    <Dot
                      key={dot.key}
                      label={dot.label}
                      x={dot.x}
                      y={dot.y}
                      variant={dot.variant}
                      offsetIndex={dot.offsetIndex}
                    />
                  ))}
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
          <h2>Active Items</h2>

          {activeItems.length === 0 ? (
            <p className="muted">No active items yet.</p>
          ) : (
            <div className="item-list">
              {activeItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`item-row ${selectedItemId === item.id ? "selected" : ""}`}
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

        <div className="card">
          <div className="top-row">
            <h2>Completed</h2>
            <button type="button" onClick={() => setShowCompleted((prev) => !prev)}>
              {showCompleted ? "Hide" : "Show"}
            </button>
          </div>

          {!showCompleted ? (
            <p className="muted">
              {completedItems.length} completed item{completedItems.length === 1 ? "" : "s"}
            </p>
          ) : completedItems.length === 0 ? (
            <p className="muted">No completed items.</p>
          ) : (
            <div className="item-list">
              {completedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`item-row completed ${selectedItemId === item.id ? "selected" : ""}`}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <div className="item-rank">✓</div>
                  <div className="item-main">
                    <div className="item-title">{item.title}</div>
                    <div className="item-sub muted">
                      {item.score === null
                        ? "Completed"
                        : `Completed • Score ${item.score.toFixed(1)}`}
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

function Dot({ x, y, label, variant, offsetIndex = 0 }) {
  const left = `${coordToPercent(x)}%`;
  const bottom = `${coordToPercent(y)}%`;

  return (
    <div className={`dot ${variant}`} style={{ left, bottom }} title={label}>
      <span style={{ top: `${-22 - offsetIndex * 16}px` }}>{label}</span>
    </div>
  );
}

function MiniDot({ x, y, selected, label }) {
  const left = `${coordToPercent(x)}%`;
  const bottom = `${coordToPercent(y)}%`;

  return (
    <div
      className={`mini-dot ${selected ? "selected" : ""}`}
      style={{ left, bottom }}
      title={label}
    />
  );
}

function coordToPercent(value) {
  return 10 + ((value - 1) / 4) * 80;
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
  return "Save for Later";
}

function humanizeBoardType(type) {
  const found = BOARD_TYPE_OPTIONS.find((option) => option.value === type);
  return found?.label ?? "Custom";
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

  .selected-card {
    border-color: #3e5f86;
    box-shadow: 0 10px 28px rgba(0,0,0,0.22);
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

  .header-actions {
    display: flex;
    gap: 8px;
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

  .board-list {
    display: grid;
    gap: 10px;
  }

  .board-list-item {
    width: 100%;
    text-align: left;
    background: #0d1d31;
  }

  .board-list-title {
    font-weight: 800;
    margin-bottom: 4px;
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

  .invite-code-box {
    margin-top: 12px;
    padding: 14px;
    border-radius: 14px;
    background: #0d1d31;
    border: 1px solid #335070;
  }

  .invite-code-label {
    font-size: 0.85rem;
    color: #8ea8c6;
    margin-bottom: 6px;
  }

  .invite-code {
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    word-break: break-all;
  }

  .selected-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .selected-title {
    font-size: 1.2rem;
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
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 0.75rem;
    color: #d9e4f2;
    pointer-events: none;
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
    opacity: 0.7;
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
    .inline-form,
    .header-actions {
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
