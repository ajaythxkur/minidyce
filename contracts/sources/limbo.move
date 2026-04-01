module minidyce::limbo {
    use std::signer;
    use minidyce::house;

    // ========================= Errors =========================
    const E_INVALID_MULTIPLIER: u64 = 300;
    const E_NO_PENDING: u64 = 301;

    // ========================= Constants =========================
    const MIN_MULTIPLIER_X100: u64 = 101;  // x1.01
    const MAX_MULTIPLIER_X100: u64 = 10000; // x100.00

    // ========================= Structs =========================

    struct PendingLimbo has key, drop {
        prediction_x100: u64,
    }

    struct LimboResult has key, drop {
        prediction_x100: u64,
        result_x100: u64,
        won: bool,
        bet_amount: u64,
        payout: u64,
    }

    // ========================= Commit-Reveal =========================

    /// Phase 1: Commit bet + prediction + sha256(secret)
    public entry fun commit_play(account: &signer, bet_amount: u64, prediction_x100: u64, commit_hash: vector<u8>) {
        assert!(prediction_x100 >= MIN_MULTIPLIER_X100 && prediction_x100 <= MAX_MULTIPLIER_X100, E_INVALID_MULTIPLIER);
        let addr = signer::address_of(account);
        assert!(!exists<PendingLimbo>(addr), E_NO_PENDING);

        house::commit(account, commit_hash, bet_amount, prediction_x100);
        move_to(account, PendingLimbo { prediction_x100 });
    }

    /// Phase 2: Reveal secret, resolve game
    public entry fun reveal_play(account: &signer, secret: vector<u8>) acquires PendingLimbo, LimboResult {
        let addr = signer::address_of(account);
        assert!(exists<PendingLimbo>(addr), E_NO_PENDING);

        let pending = move_from<PendingLimbo>(addr);
        let (rand, bet_amount) = house::resolve_commit(account, secret, 10000);

        let rand_val = rand + 1; // 1-10000
        let result_x100 = 1000000 / rand_val;

        if (result_x100 > MAX_MULTIPLIER_X100) {
            result_x100 = MAX_MULTIPLIER_X100;
        };

        let won = result_x100 >= pending.prediction_x100;
        let payout = if (won) { (bet_amount * pending.prediction_x100) / 100 } else { 0 };

        if (won) {
            house::settle_win(addr, bet_amount, payout);
        } else {
            house::settle_loss(addr, bet_amount);
        };

        if (exists<LimboResult>(addr)) {
            let r = borrow_global_mut<LimboResult>(addr);
            r.prediction_x100 = pending.prediction_x100;
            r.result_x100 = result_x100;
            r.won = won;
            r.bet_amount = bet_amount;
            r.payout = payout;
        } else {
            move_to(account, LimboResult { prediction_x100: pending.prediction_x100, result_x100, won, bet_amount, payout });
        };
    }

    // ========================= Views =========================

    #[view]
    public fun get_last_result(addr: address): (u64, u64, bool, u64, u64) acquires LimboResult {
        if (!exists<LimboResult>(addr)) return (0, 0, false, 0, 0);
        let r = borrow_global<LimboResult>(addr);
        (r.prediction_x100, r.result_x100, r.won, r.bet_amount, r.payout)
    }

    #[view]
    public fun calc_win_chance(prediction_x100: u64): u64 {
        if (prediction_x100 < MIN_MULTIPLIER_X100 || prediction_x100 > MAX_MULTIPLIER_X100) return 0;
        10000 / prediction_x100 * 100
    }
}
