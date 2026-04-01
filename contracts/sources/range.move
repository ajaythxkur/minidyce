module minidyce::range {
    use std::signer;
    use minidyce::house;

    // ========================= Errors =========================
    const E_INVALID_TARGET: u64 = 200;
    const E_NO_PENDING: u64 = 201;

    // ========================= Constants =========================
    const MIN_TARGET: u64 = 2;
    const MAX_TARGET: u64 = 96;
    const MAX_MULTIPLIER_X100: u64 = 9900; // x99 (target=2)

    // ========================= Structs =========================

    struct PendingRange has key, drop {
        target: u64,
        multiplier_x100: u64,
    }

    struct RangeResult has key, drop {
        target: u64,
        roll: u64,
        won: bool,
        multiplier_x100: u64,
        bet_amount: u64,
        payout: u64,
    }

    // ========================= Commit-Reveal =========================

    /// Phase 1: Commit bet + target + sha256(secret)
    public entry fun commit_roll(account: &signer, bet_amount: u64, target: u64, commit_hash: vector<u8>) {
        assert!(target >= MIN_TARGET && target <= MAX_TARGET, E_INVALID_TARGET);
        let addr = signer::address_of(account);
        assert!(!exists<PendingRange>(addr), E_NO_PENDING);

        let multiplier_x100 = 9900 / (target - 1);
        house::commit(account, commit_hash, bet_amount, multiplier_x100);
        move_to(account, PendingRange { target, multiplier_x100 });
    }

    /// Phase 2: Reveal secret, resolve game
    public entry fun reveal_roll(account: &signer, secret: vector<u8>) acquires PendingRange, RangeResult {
        let addr = signer::address_of(account);
        assert!(exists<PendingRange>(addr), E_NO_PENDING);

        let pending = move_from<PendingRange>(addr);
        let (rand, bet_amount) = house::resolve_commit(account, secret, 100);

        let roll_result = rand + 1; // 1-100
        let won = roll_result < pending.target;
        let payout = if (won) { (bet_amount * pending.multiplier_x100) / 100 } else { 0 };

        if (won) {
            house::settle_win(addr, bet_amount, payout);
        } else {
            house::settle_loss(addr, bet_amount);
        };

        if (exists<RangeResult>(addr)) {
            let r = borrow_global_mut<RangeResult>(addr);
            r.target = pending.target;
            r.roll = roll_result;
            r.won = won;
            r.multiplier_x100 = pending.multiplier_x100;
            r.bet_amount = bet_amount;
            r.payout = payout;
        } else {
            move_to(account, RangeResult { target: pending.target, roll: roll_result, won, multiplier_x100: pending.multiplier_x100, bet_amount, payout });
        };
    }

    // ========================= Views =========================

    #[view]
    public fun get_last_result(addr: address): (u64, u64, bool, u64, u64, u64) acquires RangeResult {
        if (!exists<RangeResult>(addr)) return (0, 0, false, 0, 0, 0);
        let r = borrow_global<RangeResult>(addr);
        (r.target, r.roll, r.won, r.multiplier_x100, r.bet_amount, r.payout)
    }

    #[view]
    public fun calc_multiplier(target: u64): u64 {
        if (target < MIN_TARGET || target > MAX_TARGET) return 0;
        9900 / (target - 1)
    }

    #[view]
    public fun calc_win_chance(target: u64): u64 {
        if (target < MIN_TARGET || target > MAX_TARGET) return 0;
        target - 1
    }
}
