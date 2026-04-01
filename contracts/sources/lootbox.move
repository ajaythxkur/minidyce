module minidyce::lootbox {
    use std::signer;
    use minidyce::house;

    // ========================= Errors =========================
    const E_INVALID_TIER: u64 = 500;
    const E_NO_PENDING: u64 = 501;

    // ========================= Constants =========================
    const TIER_BRONZE: u8 = 0;
    const TIER_SILVER: u8 = 1;
    const TIER_GOLD: u8 = 2;
    const TIER_DIAMOND: u8 = 3;
    const TIER_LEGENDARY: u8 = 4;

    const MAX_LOOTBOX_MULT_X100: u64 = 1000; // x10 max multiplier

    // ========================= Structs =========================

    struct PendingLootbox has key, drop {
        tier: u8,
        cost: u64,
    }

    struct LootboxResult has key, drop {
        tier: u8,
        cost: u64,
        multiplier_x100: u64,
        prize: u64,
        won: bool,
    }

    // ========================= Commit-Reveal =========================

    /// Phase 1: Commit tier + sha256(secret)
    public entry fun commit_open(account: &signer, tier: u8, commit_hash: vector<u8>) {
        assert!(tier <= TIER_LEGENDARY, E_INVALID_TIER);
        let addr = signer::address_of(account);
        assert!(!exists<PendingLootbox>(addr), E_NO_PENDING);

        let cost = get_tier_cost(tier);
        house::commit(account, commit_hash, cost, MAX_LOOTBOX_MULT_X100);
        move_to(account, PendingLootbox { tier, cost });
    }

    /// Phase 2: Reveal secret, resolve game
    public entry fun reveal_open(account: &signer, secret: vector<u8>) acquires PendingLootbox, LootboxResult {
        let addr = signer::address_of(account);
        assert!(exists<PendingLootbox>(addr), E_NO_PENDING);

        let pending = move_from<PendingLootbox>(addr);
        let (rand, _bet_amount) = house::resolve_commit(account, secret, 100);
        let cost = pending.cost;

        let multiplier_x100 = if (rand < 40) { 0 }
            else if (rand < 65) { 50 }
            else if (rand < 80) { 100 }
            else if (rand < 90) { 200 }
            else if (rand < 95) { 500 }
            else if (rand < 98) { 700 }
            else { 1000 };

        let prize = (cost * multiplier_x100) / 100;
        let won = prize > 0;

        if (prize >= cost) {
            house::settle_win(addr, cost, prize);
        } else if (prize > 0) {
            house::settle_win(addr, cost, prize);
        } else {
            house::settle_loss(addr, cost);
        };

        if (exists<LootboxResult>(addr)) {
            let r = borrow_global_mut<LootboxResult>(addr);
            r.tier = pending.tier;
            r.cost = cost;
            r.multiplier_x100 = multiplier_x100;
            r.prize = prize;
            r.won = won;
        } else {
            move_to(account, LootboxResult { tier: pending.tier, cost, multiplier_x100, prize, won });
        };
    }

    // ========================= Helpers =========================

    fun get_tier_cost(tier: u8): u64 {
        if (tier == TIER_BRONZE) { 500000 }
        else if (tier == TIER_SILVER) { 1000000 }
        else if (tier == TIER_GOLD) { 5000000 }
        else if (tier == TIER_DIAMOND) { 10000000 }
        else { 50000000 }
    }

    // ========================= Views =========================

    #[view]
    public fun get_last_result(addr: address): (u8, u64, u64, u64, bool) acquires LootboxResult {
        if (!exists<LootboxResult>(addr)) return (0, 0, 0, 0, false);
        let r = borrow_global<LootboxResult>(addr);
        (r.tier, r.cost, r.multiplier_x100, r.prize, r.won)
    }

    #[view]
    public fun view_tier_cost(tier: u8): u64 {
        get_tier_cost(tier)
    }

    #[view]
    public fun view_tier_costs(): (u64, u64, u64, u64, u64) {
        (500000, 1000000, 5000000, 10000000, 50000000)
    }
}
