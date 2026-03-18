import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const BOARD_TYPE_OPTIONS = [
  { value: "home_projects", label: "Home Projects" },
  { value: "purchases", label: "Purchases" },
  { value: "meal_ideas", label: "Meal Ideas" },
  { value: "custom", label: "Custom" },
];

const APP_TABS = {
  MAIN: "main",
  TOP: "top",
  DISCUSSION: "discussion",
  BOARDS: "boards",
};

const QUADRANT_FILTERS = [
  { value: "all", label: "All Quadrants" },
  { value: "Quick Win", label: "Quick Win" },
  { value: "Big Investment", label: "Big Investment" },
  { value: "Low-Stakes", label: "Low-Stakes" },
  { value: "Save for Later", label: "Save for Later" },
  { value: "Unrated", label: "Unrated" },
];

const TUTORIAL_STEPS = [
  {
    title: "Start by adding items",
    body:
      "A board is just a container until you add items to compare. Start on the Main tab and use Add Item to enter projects, purchases, meals, or whatever belongs on this board.",
  },
  {
    title: "Then rate items on Main",
    body:
      "After items exist, use the Main tab to select one, view where it lands on the grid, and rate it there.",
  },
  {
    title: "Work through unrated items first",
    body:
      "The Unrated Items list is your queue. Items stay there until you deliberately choose both Impact and Effort.",
  },
  {
    title: "Use Next when you are done",
    body:
      "After you set both ratings and feel good about them, click Next Unrated Item to move on. This keeps items from disappearing while you are still thinking.",
  },
  {
    title: "Top Priorities shows the output",
    body:
      "When you want the ranked list, go to Top Priorities. That tab is for deciding what rises to the top after things are rated.",
  },
  {
    title: "Needs Discussion shows real conflicts",
    body:
      "Needs Discussion is only for items where both people fully rated the item and still landed in meaningful disagreement.",
  },
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
  const [showActiveItems, setShowActiveItems] = useState(false);

  const [itemTitle, setItemTitle] = useState("");
  const [itemError, setItemError] = useState("");
  const [itemMessage, setItemMessage] = useState("");
  const [addingItem, setAddingItem] = useState(false);

  const [inviteCode, setInviteCode] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  const [appTab, setAppTab] = useState(APP_TABS.MAIN);
  const [topSearch, setTopSearch] = useState("");
  const [discussionSearch, setDiscussionSearch] = useState("");
  const [topQuadrantFilter, setTopQuadrantFilter] = useState("all");

  const [editingItemId, setEditingItemId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState(null);

  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

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

  useEffect(() => {
    if (!user || !household) return;

    const key = `shared-priorities-tutorial-seen-${user.id}`;
    const hasSeen = window.localStorage.getItem(key);

    if (!hasSeen) {
      setShowTutorial(true);
      setTutorialStep(0);
      window.localStorage.setItem(key, "true");
    }
  }, [user, household]);

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
      setAppTab(APP_TABS.BOARDS);
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

    const impactValues = ratings
      .map((r) => r.impact)
      .filter((value) => value !== null && value !== undefined);

    const effortValues = ratings
      .map((r) => r.effort)
      .filter((value) => value !== null && value !== undefined);

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

    const currentQuadrant = getQuadrantLabel(
      currentUserRating?.impact ?? null,
      currentUserRating?.effort ?? null
    );
    const partnerQuadrant = getQuadrantLabel(
      partnerRating?.impact ?? null,
      partnerRating?.effort ?? null
    );

    const impactDiff =
      currentUserRating &&
      partnerRating &&
      currentUserRating.impact !== null &&
      currentUserRating.impact !== undefined &&
      partnerRating.impact !== null &&
      partnerRating.impact !== undefined
        ? Math.abs(currentUserRating.impact - partnerRating.impact)
        : null;

    const effortDiff =
      currentUserRating &&
      partnerRating &&
      currentUserRating.effort !== null &&
      currentUserRating.effort !== undefined &&
      partnerRating.effort !== null &&
      partnerRating.effort !== undefined
        ? Math.abs(currentUserRating.effort - partnerRating.effort)
        : null;

    const disagreementScore =
      impactDiff !== null && effortDiff !== null
        ? impactDiff + effortDiff
        : null;

    const alignmentLabel = getAlignmentLabel(
      currentUserRating,
      partnerRating,
      disagreementScore,
      currentQuadrant,
      partnerQuadrant
    );

    return {
      ...item,
      avgImpact,
      avgEffort,
      score,
      currentUserRating,
      partnerRating,
      impactDiff,
      effortDiff,
      disagreementScore,
      currentQuadrant,
      partnerQuadrant,
      alignmentLabel,
      quadrantLabel: getQuadrantLabel(avgImpact, avgEffort),
      needsDiscussion:
        hasCompleteUserRating(currentUserRating) &&
        hasCompleteUserRating(partnerRating) &&
        (alignmentLabel === "Mid disagreement" || alignmentLabel === "High disagreement"),
      isCurrentUserUnrated: !hasCompleteUserRating(currentUserRating),
      isFullyRankedByBoth:
        hasCompleteUserRating(currentUserRating) && hasCompleteUserRating(partnerRating),
    };
  }

  function sortItems(a, b) {
    if (a.is_completed !== b.is_completed) {
      return a.is_completed ? 1 : -1;
    }

    if (a.score === null && b.score === null) {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
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
      setAppTab(APP_TABS.MAIN);
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
      setAppTab(APP_TABS.MAIN);
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
      impact: existing?.impact ?? null,
      effort: existing?.effort ?? null,
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

  function goToNextUnrated() {
    if (!selectedItem) return;
    if (!isFullyRatedByUser(selectedItem)) return;

    const next = items.find(
      (item) =>
        !item.is_completed &&
        item.id !== selectedItem.id &&
        item.isCurrentUserUnrated
    );

    if (next) {
      setSelectedItemId(next.id);
    }
  }

  function startEditingItem(item) {
    setEditingItemId(item.id);
    setEditingTitle(item.title);
    setItemError("");
    setItemMessage("");
  }

  function cancelEditingItem() {
    setEditingItemId(null);
    setEditingTitle("");
  }

  async function saveEditedItem() {
    if (!editingItemId) return;

    const title = editingTitle.trim();
    if (!title) {
      setItemError("Item title cannot be empty.");
      return;
    }

    setSavingEdit(true);
    setItemError("");
    setItemMessage("");

    try {
      const { error } = await supabase
        .from("items")
        .update({ title })
        .eq("id", editingItemId);

      if (error) throw error;

      setItemMessage("Item updated.");
      setEditingItemId(null);
      setEditingTitle("");
      await loadBoardItems(selectedBoardId);
    } catch (error) {
      console.error(error);
      setItemError(error.message || "Failed to update item.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteItem(item) {
    const confirmed = window.confirm(`Delete "${item.title}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingItemId(item.id);
    setItemError("");
    setItemMessage("");

    try {
      const { error } = await supabase.from("items").delete().eq("id", item.id);

      if (error) throw error;

      setItemMessage("Item deleted.");
      if (editingItemId === item.id) {
        setEditingItemId(null);
        setEditingTitle("");
      }

      await loadBoardItems(selectedBoardId);
    } catch (error) {
      console.error(error);
      setItemError(error.message || "Failed to delete item.");
    } finally {
      setDeletingItemId(null);
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

  function openTutorial() {
    setTutorialStep(0);
    setShowTutorial(true);
  }

  function closeTutorial() {
    setShowTutorial(false);
  }

  function nextTutorialStep() {
    if (tutorialStep >= TUTORIAL_STEPS.length - 1) {
      setShowTutorial(false);
      return;
    }
    setTutorialStep((prev) => prev + 1);
  }

  function prevTutorialStep() {
    setTutorialStep((prev) => Math.max(0, prev - 1));
  }

  const selectedBoard = useMemo(() => {
    return boards.find((board) => board.id === selectedBoardId) ?? null;
  }, [boards, selectedBoardId]);

  const selectedItem = useMemo(() => {
    return items.find((item) => item.id === selectedItemId) ?? null;
  }, [items, selectedItemId]);

  const activeItems = useMemo(() => items.filter((item) => !item.is_completed), [items]);
  const completedItems = useMemo(() => items.filter((item) => item.is_completed), [items]);

  const unratedItems = useMemo(() => {
    return activeItems.filter((item) => item.isCurrentUserUnrated);
  }, [activeItems]);

  const gridItems = useMemo(() => {
    if (!showAllGridItems) return [];
    return activeItems.filter(
      (item) => item.avgImpact !== null && item.avgEffort !== null
    );
  }, [activeItems, showAllGridItems]);

  const topPriorityItems = useMemo(() => {
    const search = topSearch.trim().toLowerCase();

    let next = activeItems;

    if (search) {
      next = next.filter((item) => item.title.toLowerCase().includes(search));
    }

    if (topQuadrantFilter !== "all") {
      next = next.filter((item) => item.quadrantLabel === topQuadrantFilter);
    }

    return [...next].sort((a, b) => {
      if (a.isFullyRankedByBoth !== b.isFullyRankedByBoth) {
        return a.isFullyRankedByBoth ? -1 : 1;
      }

      if (a.score === null && b.score === null) {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (a.score === null) return 1;
      if (b.score === null) return -1;

      return b.score - a.score;
    });
  }, [activeItems, topSearch, topQuadrantFilter]);

  const needsDiscussionItems = useMemo(() => {
    const search = discussionSearch.trim().toLowerCase();
    let next = activeItems.filter((item) => item.needsDiscussion);

    if (search) {
      next = next.filter((item) => item.title.toLowerCase().includes(search));
    }

    return [...next].sort((a, b) => {
      return (b.disagreementScore ?? -1) - (a.disagreementScore ?? -1);
    });
  }, [activeItems, discussionSearch]);

  const discussionCount = needsDiscussionItems.length;

  const selectedDots = useMemo(() => {
    if (!selectedItem) return [];

    const rawDots = [];

    if (
      selectedItem.currentUserRating &&
      selectedItem.currentUserRating.effort !== null &&
      selectedItem.currentUserRating.effort !== undefined &&
      selectedItem.currentUserRating.impact !== null &&
      selectedItem.currentUserRating.impact !== undefined
    ) {
      rawDots.push({
        key: "you",
        label: "You",
        x: selectedItem.currentUserRating.effort,
        y: selectedItem.currentUserRating.impact,
        variant: "you",
      });
    }

    if (
      selectedItem.partnerRating &&
      selectedItem.partnerRating.effort !== null &&
      selectedItem.partnerRating.effort !== undefined &&
      selectedItem.partnerRating.impact !== null &&
      selectedItem.partnerRating.impact !== undefined
    ) {
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

  function handleOpenBoard(boardId) {
    setSelectedBoardId(boardId);
    setAppTab(APP_TABS.MAIN);
  }

  function handleJumpToItem(itemId) {
    setSelectedItemId(itemId);
    setAppTab(APP_TABS.MAIN);
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
        <div className="app-shell auth-shell">
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
        <div className="app-shell auth-shell">
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

  const renderBoardsTab = appTab === APP_TABS.BOARDS;
  const renderTopTab = appTab === APP_TABS.TOP;
  const renderDiscussionTab = appTab === APP_TABS.DISCUSSION;
  const renderMainTab =
    appTab === APP_TABS.MAIN || (!selectedBoard && appTab !== APP_TABS.BOARDS);

  return (
    <>
      <div className="app-shell app-shell-with-toolbar">
        {renderBoardsTab ? (
          <>
            <div className="card">
              <div className="top-row">
                <div>
                  <div className="eyebrow">{household.name}</div>
                  <h1>Boards</h1>
                  <p className="muted">Choose a board or create a new one.</p>
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
                      className={`board-list-item ${selectedBoardId === board.id ? "selected" : ""}`}
                      onClick={() => handleOpenBoard(board.id)}
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
          </>
        ) : null}

        {renderTopTab ? (
          <>
            <div className="card">
              <div className="eyebrow">{household.name}</div>
              <h1>Top Priorities</h1>
              <p className="muted">
                Highest scoring items on {selectedBoard?.title || "this board"}.
              </p>

              <div className="filters-row top-gap">
                <input
                  value={topSearch}
                  onChange={(e) => setTopSearch(e.target.value)}
                  placeholder="Search priorities..."
                />
                <select
                  value={topQuadrantFilter}
                  onChange={(e) => setTopQuadrantFilter(e.target.value)}
                >
                  {QUADRANT_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="card">
              {topPriorityItems.length === 0 ? (
                <p className="muted">No items match this filter.</p>
              ) : (
                <div className="detail-list">
                  {topPriorityItems.map((item, index) => (
                    <DetailRow
                      key={item.id}
                      item={item}
                      rank={item.isFullyRankedByBoth ? index + 1 : null}
                      onOpen={() => handleJumpToItem(item.id)}
                      onToggleComplete={() => toggleComplete(item)}
                      onEdit={() => {
                        handleJumpToItem(item.id);
                        startEditingItem(item);
                      }}
                      onDelete={() => deleteItem(item)}
                      openLabel="Open"
                      deleting={deletingItemId === item.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}

        {renderDiscussionTab ? (
          <>
            <div className="card">
              <div className="eyebrow">{household.name}</div>
              <h1>Needs Discussion</h1>
              <p className="muted">Only items with mid or high disagreement appear here.</p>

              <input
                className="top-gap"
                value={discussionSearch}
                onChange={(e) => setDiscussionSearch(e.target.value)}
                placeholder="Search discussion items..."
              />
            </div>

            <div className="card">
              {needsDiscussionItems.length === 0 ? (
                <p className="muted">No mid or high disagreement items right now.</p>
              ) : (
                <div className="detail-list">
                  {needsDiscussionItems.map((item) => (
                    <DetailRow
                      key={item.id}
                      item={item}
                      onOpen={() => handleJumpToItem(item.id)}
                      onToggleComplete={() => toggleComplete(item)}
                      onEdit={() => {
                        handleJumpToItem(item.id);
                        startEditingItem(item);
                      }}
                      onDelete={() => deleteItem(item)}
                      openLabel="Review"
                      deleting={deletingItemId === item.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}

        {renderMainTab ? (
          <>
            <div className="card">
              <div className="top-row">
                <div>
                  <div className="eyebrow">{household.name}</div>
                  <h1>{selectedBoard?.title || "Board"}</h1>
                  <p className="muted">
                    Logged in as {profile?.display_name || user.email}
                  </p>
                </div>

                <div className="header-actions">
                  <button type="button" onClick={openTutorial}>
                    How it works
                  </button>
                  <button type="button" onClick={() => setAppTab(APP_TABS.BOARDS)}>
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
                    <div className="selected-header-main">
                      {editingItemId === selectedItem.id ? (
                        <div className="edit-inline">
                          <input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            placeholder="Edit item title"
                          />
                          <div className="edit-inline-actions">
                            <button
                              type="button"
                              className="primary"
                              onClick={saveEditedItem}
                              disabled={savingEdit}
                            >
                              {savingEdit ? "Saving..." : "Save"}
                            </button>
                            <button type="button" onClick={cancelEditingItem}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="selected-title">{selectedItem.title}</div>
                          <div className="muted">
                            {selectedItem.score === null
                              ? "Needs rating"
                              : `Score ${selectedItem.score.toFixed(1)}`}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="selected-actions">
                      <button type="button" onClick={() => startEditingItem(selectedItem)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger-btn"
                        onClick={() => deleteItem(selectedItem)}
                        disabled={deletingItemId === selectedItem.id}
                      >
                        {deletingItemId === selectedItem.id ? "Deleting..." : "Delete"}
                      </button>
                      <button type="button" onClick={() => toggleComplete(selectedItem)}>
                        {selectedItem.is_completed ? "Mark Active" : "Mark Complete"}
                      </button>
                    </div>
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

                    <div className="focus-summary">
                      <div className="summary-pill">
                        <span>Quadrant</span>
                        <strong>{selectedItem.quadrantLabel}</strong>
                      </div>
                      <div className="summary-pill">
                        <span>Alignment</span>
                        <strong>{selectedItem.alignmentLabel}</strong>
                      </div>
                    </div>
                  </div>

                  <RatingRow
                    label="Impact"
                    helpText="importance, urgency, satisfaction"
                    value={selectedItem.currentUserRating?.impact ?? null}
                    onSelect={(value) => saveRating(selectedItem, "impact", value)}
                  />

                  <RatingRow
                    label="Effort"
                    helpText="difficulty, labor, cost"
                    value={selectedItem.currentUserRating?.effort ?? null}
                    onSelect={(value) => saveRating(selectedItem, "effort", value)}
                  />

                  <div className="next-action">
                    <button
                      type="button"
                      className="primary"
                      disabled={!isFullyRatedByUser(selectedItem)}
                      onClick={goToNextUnrated}
                    >
                      Next Unrated Item
                    </button>
                  </div>

                  <div className="stack">
                    <div className="list-section-header">
                      <h3>Unrated Items</h3>
                    </div>

                    {unratedItems.length === 0 ? (
                      <p className="muted">You have rated everything active on this board.</p>
                    ) : (
                      <div className="compact-item-list">
                        {unratedItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`compact-item-row ${selectedItemId === item.id ? "selected" : ""}`}
                            onClick={() => setSelectedItemId(item.id)}
                          >
                            <span className="compact-item-name">{item.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="top-row">
                <div>
                  <h2>All Active Items</h2>
                  <p className="muted">
                    {activeItems.length} active item{activeItems.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button type="button" onClick={() => setShowActiveItems((prev) => !prev)}>
                  {showActiveItems ? "Hide" : "Show"}
                </button>
              </div>

              {!showActiveItems ? (
                <p className="muted">Browse the full active list only when you need it.</p>
              ) : activeItems.length === 0 ? (
                <p className="muted">No active items yet.</p>
              ) : (
                <div className="compact-item-list">
                  {activeItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`compact-item-row ${selectedItemId === item.id ? "selected" : ""}`}
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      <span className="compact-item-name">{item.title}</span>
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
                <div className="compact-item-list compact-item-list-completed">
                  {completedItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`compact-item-row completed ${selectedItemId === item.id ? "selected" : ""}`}
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      <span className="compact-item-name">{item.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}

        {authError && <div className="error">{authError}</div>}
      </div>

      <BottomToolbar tab={appTab} onChange={setAppTab} discussionCount={discussionCount} />

      {showTutorial ? (
        <TutorialModal
          step={tutorialStep}
          totalSteps={TUTORIAL_STEPS.length}
          title={TUTORIAL_STEPS[tutorialStep].title}
          body={TUTORIAL_STEPS[tutorialStep].body}
          onClose={closeTutorial}
          onNext={nextTutorialStep}
          onPrev={prevTutorialStep}
        />
      ) : null}

      <style>{styles}</style>
    </>
  );
}

function RatingRow({ label, helpText, value, onSelect }) {
  return (
    <div className="rating-row">
      <div className="field-label">
        {label} <span className="field-help">(ex. {helpText})</span>
      </div>
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

function BottomToolbar({ tab, onChange, discussionCount }) {
  return (
    <div className="bottom-toolbar">
      <button
        type="button"
        className={tab === APP_TABS.MAIN ? "active" : ""}
        onClick={() => onChange(APP_TABS.MAIN)}
      >
        Main
      </button>
      <button
        type="button"
        className={tab === APP_TABS.TOP ? "active" : ""}
        onClick={() => onChange(APP_TABS.TOP)}
      >
        Top Priorities
      </button>
      <button
        type="button"
        className={`toolbar-badge-btn ${tab === APP_TABS.DISCUSSION ? "active" : ""}`}
        onClick={() => onChange(APP_TABS.DISCUSSION)}
      >
        <span>Needs Discussion</span>
        {discussionCount > 0 ? <span className="notif-badge">{discussionCount}</span> : null}
      </button>
      <button
        type="button"
        className={tab === APP_TABS.BOARDS ? "active" : ""}
        onClick={() => onChange(APP_TABS.BOARDS)}
      >
        Boards
      </button>
    </div>
  );
}

function TutorialModal({
  step,
  totalSteps,
  title,
  body,
  onClose,
  onNext,
  onPrev,
}) {
  const isLast = step === totalSteps - 1;

  return (
    <div className="tutorial-overlay" onClick={onClose}>
      <div className="tutorial-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-top">
          <div className="tutorial-step">
            Step {step + 1} of {totalSteps}
          </div>
          <button type="button" className="tutorial-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <h2>{title}</h2>
        <p className="tutorial-body">{body}</p>

        <div className="tutorial-dots">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <span
              key={index}
              className={`tutorial-dot ${index === step ? "active" : ""}`}
            />
          ))}
        </div>

        <div className="tutorial-actions">
          <button type="button" onClick={onClose}>
            Skip
          </button>
          <div className="tutorial-actions-right">
            <button type="button" onClick={onPrev} disabled={step === 0}>
              Back
            </button>
            <button type="button" className="primary" onClick={onNext}>
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  item,
  rank,
  onOpen,
  onToggleComplete,
  onEdit,
  onDelete,
  openLabel,
  deleting = false,
}) {
  return (
    <div className="detail-row">
      <div className="detail-row-main">
        <div className="detail-row-title-line">
          {rank ? <div className="detail-rank">{rank}</div> : null}
          <div className="detail-title">{item.title}</div>
        </div>

        <div className="detail-meta">
          <span className={`pill ${badgeClassFromQuadrant(item.quadrantLabel)}`}>
            {item.quadrantLabel}
          </span>
          <span className="pill pill-neutral">{item.alignmentLabel}</span>
          <span className="pill pill-neutral">Score {formatMaybe(item.score)}</span>
        </div>
      </div>

      <div className="detail-actions">
        <button type="button" onClick={onOpen}>
          {openLabel}
        </button>
        <button type="button" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="danger-btn" onClick={onDelete} disabled={deleting}>
          {deleting ? "Deleting..." : "Delete"}
        </button>
        <button type="button" onClick={onToggleComplete}>
          {item.is_completed ? "Mark Active" : "Complete"}
        </button>
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

function hasCompleteUserRating(rating) {
  return (
    !!rating &&
    rating.impact !== null &&
    rating.impact !== undefined &&
    rating.effort !== null &&
    rating.effort !== undefined
  );
}

function isFullyRatedByUser(item) {
  const r = item?.currentUserRating;
  return (
    !!r &&
    r.impact !== null &&
    r.impact !== undefined &&
    r.effort !== null &&
    r.effort !== undefined
  );
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

function getAlignmentLabel(
  currentUserRating,
  partnerRating,
  disagreementScore,
  currentQuadrant,
  partnerQuadrant
) {
  if (!hasCompleteUserRating(currentUserRating) || !hasCompleteUserRating(partnerRating)) {
    return "Waiting on ratings";
  }

  if (disagreementScore === null) return "Waiting on ratings";

  if (currentQuadrant === partnerQuadrant) {
    return disagreementScore >= 5 ? "Mid disagreement" : "Low disagreement";
  }

  const quadrantDistance = getQuadrantDistance(currentQuadrant, partnerQuadrant);

  if (quadrantDistance >= 2) return "High disagreement";
  if (quadrantDistance === 1) {
    return disagreementScore >= 5 ? "High disagreement" : "Mid disagreement";
  }

  if (disagreementScore <= 2) return "Low disagreement";
  if (disagreementScore <= 4) return "Mid disagreement";
  return "High disagreement";
}

function getQuadrantDistance(a, b) {
  const positions = {
    "Quick Win": [0, 0],
    "Big Investment": [1, 0],
    "Low-Stakes": [0, 1],
    "Save for Later": [1, 1],
  };

  if (!positions[a] || !positions[b]) return 0;

  const [ax, ay] = positions[a];
  const [bx, by] = positions[b];

  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function humanizeBoardType(type) {
  const found = BOARD_TYPE_OPTIONS.find((option) => option.value === type);
  return found?.label ?? "Custom";
}

function badgeClassFromQuadrant(quadrant) {
  switch (quadrant) {
    case "Quick Win":
      return "pill-quick-win";
    case "Big Investment":
      return "pill-big-investment";
    case "Low-Stakes":
      return "pill-low-stakes";
    case "Save for Later":
      return "pill-save-for-later";
    default:
      return "pill-unrated";
  }
}

const styles = `
  * {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    min-height: 100%;
  }

  body {
    margin: 0;
    font-family: Inter, system-ui, sans-serif;
    background: #0b1727;
    color: #f4f7fb;
  }

  button,
  input,
  select {
    font: inherit;
  }

  .app-shell {
    max-width: 760px;
    margin: 0 auto;
    padding: 16px;
    display: grid;
    gap: 16px;
  }

  .app-shell-with-toolbar {
    padding-bottom: 96px;
  }

  .auth-shell {
    padding-bottom: 16px;
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

  h1, h2, h3, p {
    margin-top: 0;
  }

  h2, h3 {
    margin-bottom: 6px;
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

  .field-help {
    font-weight: 500;
    color: #9cb1ca;
    font-size: 0.9rem;
  }

  input,
  select {
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

  .danger-btn {
    background: rgba(229, 57, 53, 0.14);
    border-color: rgba(229, 57, 53, 0.35);
    color: #ffd6d4;
  }

  button:disabled {
    opacity: 0.55;
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
  .bottom-toolbar button.active,
  .board-list-item.selected,
  .compact-item-row.selected {
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
    flex-wrap: wrap;
  }

  .filters-row {
    display: grid;
    grid-template-columns: 1fr 220px;
    gap: 10px;
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

  .selected-header-main {
    flex: 1;
    min-width: 0;
  }

  .selected-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .selected-title {
    font-size: 1.2rem;
    font-weight: 800;
  }

  .edit-inline {
    display: grid;
    gap: 10px;
  }

  .edit-inline-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
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

  .focus-summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .summary-pill {
    background: #0d1d31;
    border: 1px solid #335070;
    border-radius: 14px;
    padding: 12px 14px;
    display: grid;
    gap: 4px;
  }

  .summary-pill span {
    font-size: 0.8rem;
    color: #9cb1ca;
  }

  .summary-pill strong {
    font-size: 0.95rem;
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

  .next-action {
    display: flex;
    justify-content: flex-end;
  }

  .list-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .compact-item-list {
    display: grid;
    gap: 8px;
    max-height: 292px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .compact-item-list-completed {
    max-height: 240px;
  }

  .compact-item-row {
    width: 100%;
    text-align: left;
    background: #0d1d31;
    border: 1px solid #2c4765;
    padding: 12px 14px;
    min-height: 50px;
  }

  .compact-item-row.completed {
    opacity: 0.75;
  }

  .compact-item-name {
    display: block;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail-list {
    display: grid;
    gap: 12px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    background: #0d1d31;
    border: 1px solid #2a4562;
    border-radius: 16px;
    padding: 14px;
  }

  .detail-row-main {
    display: grid;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .detail-row-title-line {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .detail-rank {
    min-width: 32px;
    height: 32px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #18304c;
    border: 1px solid #335070;
    font-weight: 800;
    color: #d9e4f2;
    flex-shrink: 0;
  }

  .detail-title {
    font-weight: 800;
    line-height: 1.3;
    word-break: break-word;
  }

  .detail-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .detail-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 700;
    border: 1px solid transparent;
  }

  .pill-quick-win {
    background: rgba(72, 187, 120, 0.18);
    color: #b6f5ca;
    border-color: rgba(72, 187, 120, 0.35);
  }

  .pill-big-investment {
    background: rgba(240, 163, 41, 0.18);
    color: #ffd79b;
    border-color: rgba(240, 163, 41, 0.35);
  }

  .pill-low-stakes {
    background: rgba(78, 161, 255, 0.16);
    color: #bfddff;
    border-color: rgba(78, 161, 255, 0.35);
  }

  .pill-save-for-later {
    background: rgba(156, 177, 202, 0.16);
    color: #d5e1ef;
    border-color: rgba(156, 177, 202, 0.3);
  }

  .pill-unrated,
  .pill-neutral {
    background: rgba(255, 255, 255, 0.08);
    color: #d9e4f2;
    border-color: rgba(255,255,255,0.16);
  }

  .bottom-toolbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    padding: 10px 12px 10px 12px;
    background: rgba(10, 19, 31, 0.96);
    border-top: 1px solid #233b58;
    backdrop-filter: blur(10px);
  }

  .bottom-toolbar button {
    min-height: 48px;
    padding: 10px 8px;
    font-size: 0.88rem;
    text-align: center;
    background: #13273f;
  }

  .toolbar-badge-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .notif-badge {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: #e53935;
    color: white;
    font-size: 0.72rem;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    box-shadow: 0 0 0 2px rgba(10, 19, 31, 0.96);
  }

  .tutorial-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0,0,0,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .tutorial-modal {
    width: min(560px, 100%);
    background: #11243b;
    border: 1px solid #335070;
    border-radius: 22px;
    padding: 20px;
    box-shadow: 0 18px 48px rgba(0,0,0,0.35);
    display: grid;
    gap: 16px;
  }

  .tutorial-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .tutorial-step {
    color: #9cb1ca;
    font-size: 0.9rem;
    font-weight: 700;
  }

  .tutorial-close {
    min-width: 40px;
    min-height: 40px;
    padding: 0;
  }

  .tutorial-body {
    color: #d9e4f2;
    line-height: 1.5;
    margin-bottom: 0;
  }

  .tutorial-dots {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  .tutorial-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #335070;
  }

  .tutorial-dot.active {
    background: #f0a329;
  }

  .tutorial-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .tutorial-actions-right {
    display: flex;
    gap: 8px;
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
    .header-actions,
    .detail-row,
    .filters-row,
    .tutorial-actions {
      display: grid;
    }

    .board-grid {
      grid-template-columns: 1fr;
    }

    .auth-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .focus-summary {
      grid-template-columns: 1fr;
    }

    .detail-actions,
    .selected-actions,
    .edit-inline-actions,
    .tutorial-actions-right {
      flex-direction: row;
      flex-wrap: wrap;
    }

    .bottom-toolbar button {
      font-size: 0.8rem;
      padding: 8px 6px;
    }

    .toolbar-badge-btn {
      gap: 4px;
    }

    .notif-badge {
      min-width: 18px;
      height: 18px;
      font-size: 0.68rem;
      padding: 0 5px;
    }
  }
`;
