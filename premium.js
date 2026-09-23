// ========== premium.js — Optional paid unlock via a Razorpay Payment Link ==========
//
// This game has no accounts (see Profile in game.js), so "premium" is a
// single per-browser unlock stored in localStorage — the same way save
// progress already works. Payment happens entirely on Razorpay's own
// hosted Payment Link page; this game never sees card details. When
// Razorpay redirects back here it appends signed query params, which a
// small stateless endpoint on the Colyseus HF Space backend verifies (see
// /multiplayer-server/README.md) — that's the only server involvement.
//
// ⚠️ SETUP REQUIRED before this can take a real payment:
//   1. Create a Payment Link in your Razorpay Dashboard for the amount you
//      want to charge, and put its URL in PAYMENT_LINK_URL below.
//   2. In that Payment Link's settings, enable "Redirect after payment" and
//      set the Redirect URL to this game's own deployed URL. Razorpay then
//      appends razorpay_payment_id / razorpay_payment_link_id /
//      razorpay_payment_link_reference_id / razorpay_payment_link_status /
//      razorpay_signature query params automatically — nothing else to wire.
//   3. Deploy /multiplayer-server (already needed for co-op) with
//      RAZORPAY_KEY_SECRET set as a Space secret, and confirm
//      VERIFY_ENDPOINT below points at it.
// Until step 1 is done, the buy button safely explains it isn't configured
// yet instead of pretending to charge anyone.

const Premium = {
    PAYMENT_LINK_URL: 'https://rzp.io/l/REPLACE_WITH_YOUR_PAYMENT_LINK',
    VERIFY_ENDPOINT: 'https://vbnm1bbg-matheybackend.hf.space/verify-payment-link',
    KEY: 'emojiWarzPremium',

    els: {},

    init() {
        this.els = {
            modal: document.getElementById('premium-modal'),
            text: document.getElementById('premium-modal-text'),
            buyBtn: document.getElementById('premium-modal-buy-btn'),
            closeBtn: document.getElementById('premium-modal-close-btn'),
            status: document.getElementById('premium-modal-status')
        };
        this.els.buyBtn?.addEventListener('click', () => this.startCheckout());
        this.els.closeBtn?.addEventListener('click', () => this.closeModal());
        document.getElementById('premium-market-btn')?.addEventListener('click', () => this.openModal('market'));

        this._refreshSkipButtonLabel();
        this._handleRedirectIfAny();
    },

    isUnlocked() {
        return localStorage.getItem(this.KEY) === 'true';
    },

    openModal(context) {
        if (this.isUnlocked()) return;
        if (this.els.text) {
            this.els.text.innerText = context === 'skip'
                ? 'Skipping straight to Level 100 is a premium perk.'
                : 'Unlock premium skins, auras, and the Level 100 skip — forever, on this device.';
        }
        this.els.status?.classList.add('hidden');
        this.els.modal?.classList.remove('hidden');
    },

    closeModal() { this.els.modal?.classList.add('hidden'); },

    startCheckout() {
        if (this.PAYMENT_LINK_URL.includes('REPLACE_WITH_YOUR_PAYMENT_LINK')) {
            this._setStatus('Payments aren’t configured yet — add your Razorpay Payment Link in premium.js.');
            return;
        }
        window.open(this.PAYMENT_LINK_URL, '_blank', 'noopener');
    },

    _setStatus(msg) {
        if (!this.els.status) return;
        this.els.status.innerText = msg;
        this.els.status.classList.remove('hidden');
    },

    // Razorpay redirects back here after payment with signed query params.
    // We verify them against our own backend (never trust them blindly —
    // anyone could hand-craft a URL with a fake "paid" status otherwise).
    async _handleRedirectIfAny() {
        const params = new URLSearchParams(window.location.search);
        const paymentId = params.get('razorpay_payment_id');
        const linkId = params.get('razorpay_payment_link_id');
        const signature = params.get('razorpay_signature');
        if (!paymentId || !linkId || !signature) return;

        const payload = {
            razorpay_payment_id: paymentId,
            razorpay_payment_link_id: linkId,
            razorpay_payment_link_reference_id: params.get('razorpay_payment_link_reference_id') || '',
            razorpay_payment_link_status: params.get('razorpay_payment_link_status') || '',
            razorpay_signature: signature
        };

        // Strip the params immediately so a page refresh can't re-trigger this.
        history.replaceState({}, '', window.location.pathname);

        try {
            const res = await fetch(this.VERIFY_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data && data.valid) {
                localStorage.setItem(this.KEY, 'true');
                this._refreshSkipButtonLabel();
                if (typeof renderMarketplace === 'function') renderMarketplace();
                alert('Premium unlocked! Thank you 💎');
            } else {
                alert('Payment could not be verified. If you were charged, please contact support.');
            }
        } catch (e) {
            console.error('[Premium] verification request failed', e);
            alert('Could not verify payment right now — check your connection. Contact support if you were charged.');
        }
    },

    _refreshSkipButtonLabel() {
        const btn = document.getElementById('skip-100-btn');
        if (btn) btn.innerText = this.isUnlocked() ? 'SKIP TO LV 100' : '⭐ SKIP TO LV 100 (Premium)';
        document.getElementById('premium-market-btn')?.classList.toggle('hidden', this.isUnlocked());
    }
};

window.addEventListener('load', () => Premium.init());
