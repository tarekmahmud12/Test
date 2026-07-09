const tg = window.Telegram.WebApp;
tg.expand();

let isRichAdsEnabled = false; // অ্যাড চালু আছে কি না
let richAdsInterval = 15;    // কত সেকেন্ড পর পর অ্যাড আসবে (ডিফল্ট ৬০ সেকেন্ড বা ১ মিনিট)

// --- অ্যাপ স্টেট এবং ভেরিয়েবল ---
let currentUser = { 
    id: "000000", name: "Loading...", pp: 0, usdt: 0, 
    totalDeposited: 0, referrals: 0, photo: "", lastBonus: 0, bonusDay: 0,
    miningStartTime: 0, uid: "" 
};
window.currentUser = currentUser; // এই গ্লোবাল লাইনটি যোগ করা হলো
let isMining = false;
let miningTimer = null;
let selectedWithdrawAmount = 0;
let adCooldownMinutes = 5; 
let lastClickedTaskId = null;
// --- নতুন হেল্পার ফাংশন: ইউজারের দেশ বের করার জন্য (init এর উপরে রাখবেন) ---
async function fetchUserCountry() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        return data.country_name || "Unknown";
    } catch (e) {
        console.error("Country Fetch Error:", e);
        return "Unknown";
    }
}

// --- আপনার আপডেটেড নতুন অ্যাপ শুরুর ইনিশিয়ালাইজেশন ফাংশন (সম্পূর্ণ একত্রে) ---
async function init() {
    const tgUser = tg.initDataUnsafe?.user;
    currentUser.id = tgUser ? tgUser.id.toString() : "99999";
    currentUser.name = tgUser ? (tgUser.first_name + (tgUser.last_name ? " " + tgUser.last_name : "")) : "Web User";
    currentUser.photo = tgUser?.photo_url || "";

    // ১. রেফারেল আইডি উদ্ধার করা (start_param: r_123456)
    const startParam = tg.initDataUnsafe?.start_param || null;
    let referrerId = null;
    if (startParam && startParam.startsWith("r_")) {
        referrerId = startParam.replace("r_", "");
    }

    // --- নতুন আপডেট: দেশ এবং বর্তমান সময় সংগ্রহ ---
    const userCountry = await fetchUserCountry();
    const currentTime = Date.now(); 

    try {
        const settingsSnap = await getDoc(doc(db, "settings", "config"));
        if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            adCooldownMinutes = data.adCooldown || 5;

            // --- RichAds Auto Control ---
            isRichAdsEnabled = data.richAdsActive || false; 
            richAdsInterval = data.richAdsInterval || 60; 
            
            if (isRichAdsEnabled) {
                startAutoAdExtra();
            }
        }
    } catch (e) { console.log("Settings load error."); }

    const userRef = doc(db, "users", currentUser.id);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
        // --- পুরাতন ইউজারদের জন্য ডাটাবেজে আপডেট পাঠানো (দেশ ও অ্যাক্টিভ টাইম) ---
        await updateDoc(userRef, {
            lastActive: currentTime,
            country: userCountry
        });

        // লোকাল অবজেক্ট আপডেট
        currentUser = { ...currentUser, ...snap.data(), lastActive: currentTime, country: userCountry };
        
        // লোকাল স্টোরেজে ডাটা সেভ রাখা
        localStorage.setItem('cached_user', JSON.stringify(currentUser));
    } else {
        // ২. নতুন ইউজার ডাটাবেজ তৈরি
        const newUser = {
            id: currentUser.id,
            name: currentUser.name,
            pp: 0,
            usdt: 0,
            country: userCountry,         // নতুন ইউজারের দেশ সেভ হবে
            lastActive: currentTime,      // নতুন ইউজারের সময় সেভ হবে
            total_ref_earnings: 0,
            referral_count: 0,
            referredBy: (referrerId && referrerId !== currentUser.id) ? referrerId : null,
            referralRewarded: false,
            lastBonus: 0,
            bonusDay: 0,
            miningStartTime: 0,
            isMining2x: false,
            isVerified: false,
            mining2xExpiry: 0,
            createdAt: serverTimestamp(),
            lastAdTime_adsgram: 0, 
            lastAdTime_monetag: 0, 
            lastAdTime_adexora: 0, 
            lastAdTime_gigapub: 0,
            lastAdTime_adexium: 0
        };

        await setDoc(userRef, newUser);
        currentUser = newUser;

    
    checkExistingMining();
    ['gigapub', 'adsgram', 'monetag', 'adexora', 'adexium'].forEach(type => checkSpecificAdCooldown(type));
    
if (window.checkWebVisitCooldown) window.checkWebVisitCooldown(); 
    
    updateUI();
}
// --- অ্যাড কুলডাউন চেক ---
function checkSpecificAdCooldown(type) {
    const now = Date.now();
    const lastAd = currentUser[`lastAdTime_${type}`] || 0;
    const cooldownMs = adCooldownMinutes * 60 * 1000;
    const diff = now - lastAd;

    if (diff < cooldownMs) {
        const remainingSec = Math.ceil((cooldownMs - diff) / 1000);
        updateSingleAdButton(type, false, remainingSec);
        
        const timer = setInterval(() => {
            const currentNow = Date.now();
            const currentDiff = currentNow - lastAd;
            if (currentDiff >= cooldownMs) {
                clearInterval(timer);
                updateSingleAdButton(type, true);
            } else {
                updateSingleAdButton(type, false, Math.ceil((cooldownMs - currentDiff) / 1000));
            }
        }, 1000);
    } else {
        updateSingleAdButton(type, true);
    }
}


    };





// --- টাস্ক অ্যাড দেখা (Auto & Manual combined) ---
window.watchTaskAd = (type) => {
    if (type === 'gigapub') {
        // Gigapub Reward Ad Logic
        window.showGiga()
            .then(() => {
                processTask(0.001, 'gigapub'); // অ্যাড দেখা শেষ হলে রিওয়ার্ড পাবে
            })
            .catch(e => {
                console.error("Gigapub Error:", e);
                alert("Ad not available or closed early.");
            });
    }
    else if (type === 'monetag') {
        if(typeof show_10373507 === 'function') {
            show_10373507().then(() => processTask(0.001, 'monetag'));
        } else {
            alert("Monetag SDK is not loaded!");
        }
    } 
    else if (type === 'adexora') {
        if (typeof window.showAdexora === 'function') {
            window.showAdexora()
                .then(() => processTask(0.0005, 'adexora'))
                .catch(() => alert("Adexora Ads not available."));
        } else {
            alert("Adexora SDK not loaded!");
        }
    } 
    else if (type === 'adexium') {
        // বাটন ক্লিকের মাধ্যমে রিওয়ার্ড পাওয়ার লজিক
        const instance = window.adexiumAds || window.adexiumInstance;
        
        if (instance) {
            const btn = document.getElementById('btn-adexium');
            const originalText = btn?.innerText || "WATCH";
            
            if(btn) {
                btn.disabled = true;
                btn.innerText = "Loading...";
            }

            instance.play()
                .then(() => {
                    processTask(0.001, 'adexium'); // বাটন ক্লিকের রিওয়ার্ড
                    if(btn) {
                        btn.disabled = false;
                        btn.innerText = "WATCH";
                    }
                })
                .catch(e => {
                    // এখানে alert সরিয়ে দিয়েছি যাতে ইউজার বিরক্ত না হয়
                    console.log("Adexium manual ad not ready.");
                    if(btn) {
                        btn.disabled = false;
                        btn.innerText = originalText;
                    }
                });
        } else {
            console.log("Adexium is still initializing...");
        }
    }
};

// --- টাস্ক রিওয়ার্ড প্রসেস ---
async function processTask(amount, adType) {
    const now = Date.now();
    const userRef = doc(db, "users", currentUser.id);
    const updateData = { usdt: increment(amount) };
    updateData[`lastAdTime_${adType}`] = now;
    await updateDoc(userRef, updateData);
    currentUser.usdt += amount; 
    currentUser[`lastAdTime_${adType}`] = now;
    updateUI(); 
    checkSpecificAdCooldown(adType); 
    alert("Reward Added!");
}


// --- মডাল ওপেন ---
window.openModal = (id) => document.getElementById(id).classList.remove('hidden');

// --- Cloudinary Configuration ---
const CLOUD_NAME = "dnlvrtnga";
const UPLOAD_PRESET = "pp_mining_preset";

// --- ১. ডিপোজিট সাবমিট (Cloudinary Image Upload সহ) ---
window.submitDeposit = async () => {
    const amountInput = document.getElementById('dep-amount');
    const screenshotInput = document.getElementById('dep-screenshot');
    const btn = document.querySelector('[onclick="submitDeposit()"]');

    const amount = amountInput.value;
    const file = screenshotInput.files[0];

    if (!amount || amount <= 0) return alert("Enter a valid amount!");
    if (!file) return alert("Please upload a payment screenshot!");

    try {
        btn.disabled = true;
        btn.innerText = "Uploading Proof...";

        // Cloudinary-তে ছবি আপলোড
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', UPLOAD_PRESET);

        const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        });

        const cloudData = await cloudRes.json();

        if (cloudData.secure_url) {
            // ফায়ারবেসে ডাটা সেভ (ইমেজ লিঙ্ক সহ)
            await addDoc(collection(db, "deposits"), {
                userId: currentUser.id,
                userName: currentUser.name,
                amount: parseFloat(amount),
                screenshotUrl: cloudData.secure_url, 
                status: "pending",
                time: Date.now()
            });

            alert("Deposit submitted! Admin will verify the screenshot.");
            amountInput.value = "";
            screenshotInput.value = "";
            closeModal('modal-deposit');
        } else {
            throw new Error("Cloudinary Upload Failed");
        }
    } catch (e) {
        console.error("Deposit Error:", e);
        alert("Submission failed! Try again.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Submit Deposit";
    }
};


// --- ইন্টারফেস আপডেট (UI) ---
// এই একটি ফাংশনই এখন অ্যাপের সাধারণ UI এবং ডম-এর সমস্ত ব্যালেন্স একত্রে রিয়েল-টাইমে সিঙ্ক করবে
function updateUI() {
    // ১. সাধারণ ইউজার ডাটা আপডেট
    if (document.getElementById('user-name')) {
        document.getElementById('user-name').innerText = currentUser.name;
    }
    if (document.getElementById('user-id')) {
        document.getElementById('user-id').innerText = currentUser.id;
    }
    if (document.getElementById('usdt-header')) {
        document.getElementById('usdt-header').innerText = (currentUser.usdt || 0).toFixed(4);
    }
    
    // ২. রেফারেল ডাটা আপডেট
    if (document.getElementById('total-ref')) {
        document.getElementById('total-ref').innerText = currentUser.referral_count || 0;
    }
    if (document.getElementById('ref-earn')) {
        document.getElementById('ref-earn').innerText = (currentUser.total_ref_earnings || 0).toFixed(0) + " PP";
    }

    // ৩. প্রোফাইল পিকচার আপডেট
    if (currentUser.photo) {
        const img = document.getElementById('user-photo');
        if (img) {
            img.src = currentUser.photo; 
            img.classList.remove('hidden');
        }
        const placeholder = document.getElementById('user-placeholder');
        if (placeholder) placeholder.classList.add('hidden');
    }

    // ৪. ভেরিফাইড ব্যাজ কন্ট্রোল (৩০ রেফার বা কেনা থাকলে)
    if ((currentUser.referral_count || 0) >= 30 || currentUser.isVerified) {
        const badge = document.getElementById('verified-badge');
        if (badge) badge.classList.remove('hidden');
    }

    // ==================== 🔥 নতুন লাইভ ব্যালেন্স সিঙ্ক লজিক ====================
    // এটি নিশ্চিত করবে যে গ্লোবাল অবজেক্টের pp এর ফুল ভ্যালু (.toFixed(2) সহ) সব জায়গায় একত্রে আপডেট হচ্ছে
    const currentFullBalance = currentUser.pp || 0;

    const balanceSelectors = [
        '#pp-header', '#pp-balance', '#user-pp', 
        '.pp-amount', '.user-pp', '.pp-balance', 
        '#balance-display', '#total-pp', '#user-coins'
    ];

    balanceSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
            if (element) {
                // এলিমেন্টটি যদি ইনপুট ফিল্ড হয় (যেমন কোনো ফর্ম বা টেক্সট বক্স)
                if (element.tagName === "INPUT") {
                    element.value = parseFloat(currentFullBalance).toFixed(2);
                } else {
                    // সাধারণ টেক্সট এলিমেন্ট (div, span, p, h1) হলে
                    element.innerText = parseFloat(currentFullBalance).toFixed(2);
                }
            }
        });
    });
    // =========================================================================
}

// --- ট্যাব সুইচিং (Firestore রিয়েল-টাইম আপডেট ফ্রেন্ডলি ভার্সন - আপডেটেড) ---
window.switchTab = (tab, el) => {
    // ১. সব পেজ এবং খোলা থাকা মোডাল আগে লুকিয়ে ফেলুন
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    // ২. এখন কাঙ্ক্ষিত পেজটি দেখান
    const targetPage = document.getElementById(`page-${tab}`);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    }

    // ৩. স্মার্ট লোডিং লজিক (এখানেই নতুন ফাংশনগুলো যোগ করা হয়েছে)
    if (tab === 'task' || tab === 'tasks') {
        // নতুন টাস্ক এবং নিজের তৈরি করা টাস্ক দুইটাই লোড হবে
        if (typeof loadAvailableTasks === 'function') loadAvailableTasks(); 
        if (typeof loadMyTasksManagement === 'function') loadMyTasksManagement(); 
        if (typeof loadAppInstallTasks === 'function') loadAppInstallTasks();
    } 
    else if (tab === 'refer' || tab === 'leaderboard') {
        if (typeof loadLeaderboard === 'function') loadLeaderboard(); 
    } 
    else if (tab === 'profile') {
        if (window.loadWithdrawHistory) window.loadWithdrawHistory(); 
    }
// switchTab ফাংশনের ভেতরে এভাবে পরিবর্তন করুন
if (tab === 'event') {
    loadEventPageData(); // ইউজার ক্লিক করলেই কেবল টাইমার চেক হবে
}
    // ৪. নেভিগেশন আইকন হাইলাইট করার লজিক
    if (el) {
        el.classList.add('active');
    } else {
        const navBtn = document.querySelector(`.nav-btn[onclick*="'${tab}'"]`);
        if (navBtn) navBtn.classList.add('active');
    }
    
    // ৫. টেলিগ্রাম হ্যাপটিক ফিডব্যাক
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
};

// --- মোডাল ক্লোজ করার জন্য শক্তিশালী ফাংশন ---
window.closeModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden');
    } else {
        // যদি নির্দিষ্ট আইডি না পায়, তবে স্ক্রিনে খোলা থাকা যেকোনো মোডাল বন্ধ করার চেষ্টা করবে
        console.warn("Modal ID not found, closing visible modals...");
        document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden'));
    }
};



// --- লিডারবোর্ড ফাংশন (রেফারেল অনুযায়ী সাজানো এবং হাইলাইট করা) ---
async function loadLeaderboard() {
    // ১. ডাটাবেজ থেকে সর্বোচ্চ রেফারেল করা ১০ জনকে নিয়ে আসা
    const q = query(collection(db, "users"), orderBy("referral_count", "desc"), limit(10));
    const snap = await getDocs(q);
    
    let html = '';
    let myRank = 0;
    let myData = null;

    const docs = snap.docs;

    for (let i = 0; i < docs.length; i++) {
        const userData = docs[i].data();
        const isMe = userData.id === currentUser.id;
        
        // ২. বর্তমানে যে ইউজার অ্যাপ দেখছে তার র‍্যাঙ্ক পজিশন খুঁজে বের করা
        if (isMe) {
            myRank = i + 1;
            myData = userData;
        }

        // ৩. প্রধান লিস্টে সেরা ১০ জনকে দেখানো
        if (i < 10) {
            // র‍্যাঙ্ক নাম্বার বা মেডেল লজিক
            let rankDisplay = `#${i + 1}`;
            if (i === 0) rankDisplay = "🥇";
            else if (i === 1) rankDisplay = "🥈";
            else if (i === 2) rankDisplay = "🥉";

            // ভেরিফাইড ব্যাজ লজিক (৩০+ রেফার হলে নীল টিক)
            const isVerified = (userData.referral_count || 0) >= 30;
            const verifiedIcon = isVerified ? `<svg class="w-4 h-4 fill-blue-500 inline-block ml-1" viewBox="0 0 24 24"><path d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.7l-3.61.81.34 3.68L1 12l2.44 2.79-.34 3.69 3.61.82 1.89 3.2L12 21.04l3.4 1.46 1.89-3.2 3.61-.82-.34-3.69L23 12zm-12.91 4.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z"/></svg>` : '';

            // প্রোফাইল ছবি বা ডিফল্ট আইকন
            const photoUrl = userData.photo || '';
            const photoHTML = photoUrl 
                ? `<img src="${photoUrl}" class="w-8 h-8 rounded-full border border-blue-500/30 object-cover">`
                : `<div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-blue-400 font-bold border border-blue-500/20">PP</div>`;

            // ৪. লিডারবোর্ড রো তৈরি (রেফারেল সংখ্যাকে বড় এবং হাইলাইট করা হয়েছে)
            html += `
                <div class="flex justify-between items-center p-4 border-b border-white/5 ${isMe ? 'bg-blue-600/10' : ''}">
                    <div class="flex items-center gap-3 overflow-hidden">
                        <span class="text-sm font-black w-6 text-center">${rankDisplay}</span>
                        ${photoHTML}
                        <div class="flex flex-col">
                            <span class="text-xs font-bold flex items-center ${isMe ? 'text-blue-400' : 'text-white'}">
                                ${userData.name}${verifiedIcon}
                            </span>
                            <span class="text-[10px] text-slate-400 font-bold tracking-tight">${(userData.pp || 0).toFixed(0)} PP COIN</span>
                        </div>
                    </div>
                    
                    <div class="text-right flex flex-col items-end">
                        <span class="text-sm font-black text-green-400 uppercase tracking-tighter">${userData.referral_count || 0} REFS</span>
                        <span class="text-[8px] text-slate-500 font-bold uppercase">Referrals</span>
                    </div>
                </div>`;
        }
    }

    document.getElementById('leaderboard-list').innerHTML = html;

    // ৫. ইউজারের নিজের র‍্যাঙ্ক কার্ড আপডেট (যা সবার উপরে থাকে)
    const myRankContainer = document.getElementById('my-rank-container');
    if (myRankContainer) {
        myRankContainer.classList.remove('hidden');
        
        document.getElementById('my-rank-number').innerText = myRank > 0 ? `#${myRank}` : "100+";
        
        document.getElementById('my-rank-pp').innerHTML = `
            <div class="flex items-center gap-4">
                <div class="text-right">
                    <p class="text-sm font-black text-green-400">${currentUser.referral_count || 0} REFS</p>
                    <p class="text-[10px] font-bold text-blue-400">${(currentUser.pp || 0).toFixed(0)} PP COIN</p>
                </div>
            </div>
        `;
    }
}
// --- স্টোর পারচেজ লজিক ---
window.buyUpgrade = async (plan) => {
    const userRef = doc(db, "users", currentUser.id);
    const cost = 1.00; // আপনার উভয় প্ল্যানের দাম ১ ডলার

    if (currentUser.usdt < cost) {
        alert("Insufficient USDT Balance! Please deposit first.");
        window.switchTab('profile'); // ব্যালেন্স না থাকলে প্রোফাইল/ডিপোজিট পেজে নিয়ে যাবে
        return;
    }

    if (!confirm(`Are you sure you want to buy this upgrade for ${cost} USDT?`)) return;

    try {
        if (plan === 'mining_2x') {
            // মাইনিং ২ গুণ লজিক (ভবিষ্যতে আপনি এটি দিয়ে mining rate ডাবল করবেন)
            await updateDoc(userRef, { 
                usdt: increment(-cost),
                isMining2x: true,
                mining2xExpiry: Date.now() + (30 * 24 * 60 * 60 * 1000) // ৩০ দিন
            });
            alert("Success! Mining 2x activated for 30 days.");
        } 
        else if (plan === 'verification') {
            // ভেরিফিকেশন ব্যাজ লজিক
            await updateDoc(userRef, { 
                usdt: increment(-cost),
                isVerified: true 
            });
            alert("Success! You are now a Verified user.");
        }

        currentUser.usdt -= cost;
        updateUI();
        tg.HapticFeedback.notificationOccurred('success');
    } catch (e) {
        console.error("Purchase Error:", e);
        alert("Something went wrong. Try again.");
    }
};

// --- টেলিগ্রাম সোশ্যাল টাস্ক সাবমিট (নতুন আইডি এবং স্ট্রাকচার অনুযায়ী আপডেট করা) ---
window.submitAdTask = async () => {
    // HTML এর ID অনুযায়ী মান সংগ্রহ
    const nameInput = document.getElementById('ad-name');
    const linkInput = document.getElementById('ad-link');
    const targetSelect = document.getElementById('ad-target');

    if (!nameInput || !linkInput || !targetSelect) {
        console.error("Input fields (ad-name, ad-link, or ad-target) not found in HTML!");
        return;
    }

    const channelName = nameInput.value.trim();
    const channelLink = linkInput.value.trim();
    const target = parseInt(targetSelect.value);
    
    // কস্ট লজিক (১০০ মেম্বার = ১ ডলার, ৫০০ = ৪.৫ ডলার, ১০০০ = ৮ ডলার)
    const costs = { 
        100: 1.00, 
        500: 4.50, 
        1000: 8.00 
    };

    const totalCost = costs[target];

    // ভ্যালিডেশন
    if (!channelName || !channelLink) {
        alert("Please fill all fields!");
        return;
    }

    if (!totalCost) {
        alert("Please select a valid package!");
        return;
    }

    if (currentUser.usdt < totalCost) {
        alert(`Insufficient USDT balance! You need ${totalCost} USDT.`);
        window.switchTab('profile'); // ব্যালেন্স না থাকলে প্রোফাইলে নিয়ে যাবে
        closeModal('modal-adtask');
        return;
    }

    try {
        // বাটন ডিজেবল করা যাতে বার বার ক্লিক না হয়
        const btn = document.querySelector('[onclick="submitAdTask()"]');
        if(btn) {
            btn.disabled = true;
            btn.innerText = "Processing...";
        }

        // ফায়ারবেস ডাটাবেজে (tasks কালেকশনে) টাস্ক অ্যাড করা
        await addDoc(collection(db, "tasks"), {
            channelName: channelName,
            channelLink: channelLink,
            targetUsers: target,
            currentJoined: 0,
            reward: 100,             // ইউজার জয়েন করলে পাবে ১০০ পিপি
            taskType: "user",        
            createdBy: currentUser.id,
            active: false,           // অ্যাডমিন এপ্রুভ করলে true হবে
            approved: false,         
            chatId: "",              // অ্যাডমিন প্যানেল থেকে আইডি বসাতে হবে
            completedBy: [],
            createdAt: serverTimestamp()
        });

        // ইউজারের USDT ব্যালেন্স কমানো
        await updateDoc(doc(db, "users", currentUser.id), { 
            usdt: increment(-totalCost) 
        });
        
        // লোকাল ডাটা এবং UI আপডেট
        currentUser.usdt -= totalCost;
        updateUI();

        alert(`Success! Mission submitted. Cost: ${totalCost} USDT. Waiting for admin approval.`);
        
        // ইনপুট ক্লিয়ার এবং মডাল বন্ধ করা
        nameInput.value = "";
        linkInput.value = "";
        closeModal('modal-adtask');

    } catch (e) {
        console.error("Submission Error:", e);
        alert("Error creating task. Please try again.");
    } finally {
        const btn = document.querySelector('[onclick="submitAdTask()"]');
        if(btn) {
            btn.disabled = false;
            btn.innerText = "Pay & Submit Task";
        }
    }
};

// --- RichAds Auto Logic ---
function startAutoRichAds() {
    // প্রথম অ্যাডটি অ্যাপ ওপেন হওয়ার ১৫ সেকেন্ড পরে আসবে
    setTimeout(() => {
        showRichInterstitial();
    }, 15000);

    // এরপর প্রতি richAdsInterval সময় পর পর অটোমেটিক অ্যাড আসবে
    setInterval(() => {
        showRichInterstitial();
    }, richAdsInterval * 1000);
}

function showRichInterstitial() {
    if (!isRichAdsEnabled) return;

    if (window.TelegramAdsController) {
        window.TelegramAdsController.show().then((result) => {
            console.log("RichAds Displayed");
        }).catch((err) => {
            console.error("RichAds error:", err);
        });
    }
}

// --- Event Configuration (Adsgram & Tads Fullscreen) ---
const EVENT_COOLDOWN = 15 * 60 * 1000; // ১৫ মিনিট
let tadsFullscreenController = null; // Tads কন্ট্রোলারের জন্য গ্লোবাল ভেরিয়েবল

/**
 * Tads ফুলস্ক্রিন কন্ট্রোলার ইনিশিয়ালাইজেশন
 * এটি অ্যাপ ওপেন হওয়ার সময় একবার কল হবে।
 */
async function initTadsFullscreen() {
    if (window.tads) {
        tadsFullscreenController = window.tads.init({
            widgetId: "9671", // আপনার ফুলস্ক্রিন উইজেট আইডি
            type: 'fullscreen',
            debug: false, // প্রোডাকশনে false রাখুন
            onShowReward: (result) => {
                console.log('Tads Fullscreen Success:', result);
                // অ্যাড সম্পূর্ণ দেখলে রিওয়ার্ড প্রসেস হবে
                processReward(true, {
                    storageKey: 'lastTadsEventTime',
                    btnId: 'btn-tads-ad',
                    timerId: 'tadsTimerDisplay'
                });
            },
            onAdsNotFound: () => {
                console.log('Tads Fullscreen: No ads found');
            }
        });
    } else {
        console.error("Tads SDK not found in window");
    }
}

// ১. মেইন হ্যান্ডলার ফাংশন (Type অনুযায়ী Adsgram বা Tads লোড করবে)
window.handleEventClick = async function(type) {
    const config = {
        adsgram: {
            storageKey: 'lastEventTime',
            btnId: 'btn-event-ad',
            timerId: 'timerDisplay',
            blockId: 'int-19956'
        },
        tads: {
            storageKey: 'lastTadsEventTime',
            btnId: 'btn-tads-ad',
            timerId: 'tadsTimerDisplay'
        }
    };

    const target = config[type];
    if (!target) return;

    const lastClick = localStorage.getItem(target.storageKey);
    const now = Date.now();

    // টাইমার চেক
    if (lastClick && (now - parseInt(lastClick)) < EVENT_COOLDOWN) {
        alert("Please wait for the timer!");
        return;
    }

    const btn = document.getElementById(target.btnId);
    if (!btn) return;
    
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Wait...";

    // --- অ্যাড নেটওয়ার্ক লজিক ---
    if (type === 'adsgram') {
        if (!window.Adsgram) { 
            alert("Adsgram SDK not loaded!"); 
            btn.disabled = false; 
            btn.innerText = "GO"; 
            return; 
        }
        const AdController = window.Adsgram.init({ blockId: target.blockId });
        AdController.show()
            .then(res => processReward(res.done, target))
            .catch(err => adError(btn, originalText));

    } else if (type === 'tads') {
        // Tads ফুলস্ক্রিন লজিক (অফিসিয়াল কন্ট্রোলার ব্যবহার করে)
        if (!tadsFullscreenController) {
            await initTadsFullscreen();
        }

        if (tadsFullscreenController) {
            tadsFullscreenController.showAd()
                .catch((err) => {
                    console.error("Tads ShowAd Error:", err);
                    adError(btn, originalText);
                });
        } else {
            alert("Tads SDK not ready yet!");
            btn.disabled = false;
            btn.innerText = "GO";
        }
    }
};

// ২. রিওয়ার্ড প্রসেস ফাংশন (ডাটাবেজ আপডেট)
async function processReward(isDone, target) {
    const btn = document.getElementById(target.btnId);
    if (isDone) {
        try {
            // ইউজারের ব্যালেন্স ৫০ পিপি বাড়ানো হচ্ছে
            const userRef = doc(db, "users", currentUser.id);
            await updateDoc(userRef, { pp: increment(50) });

            currentUser.pp += 50;
            localStorage.setItem(target.storageKey, Date.now().toString());
            
            if (typeof updateUI === "function") updateUI();
            
            // টাইমার শুরু
            startCountdown(EVENT_COOLDOWN, target.btnId, target.timerId);
            
            if (window.Telegram?.WebApp?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
            alert("Success! 50 PP Coins added.");
        } catch (error) {
            console.error("Database Error:", error);
            alert("Database Error! Please try again.");
            btn.disabled = false;
            btn.innerText = "GO";
        }
    } else {
        alert("Watch full ad to get reward.");
        btn.disabled = false;
        btn.innerText = "GO";
    }
}

// ৩. এরর হ্যান্ডলার
function adError(btn, text) {
    alert("Ads currently unavailable. Try again later.");
    btn.disabled = false;
    btn.innerText = text;
}

// ৪. ডাইনামিক টাইমার ফাংশন (সব বাটনের জন্য)
function startCountdown(duration, btnId, timerId) {
    const btn = document.getElementById(btnId);
    const timerText = document.getElementById(timerId);
    if (!btn || !timerText) return;

    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    btn.innerText = "LOCKED";
    timerText.style.display = "block";
    timerText.classList.remove('hidden');

    let timeLeft = duration;
    const interval = setInterval(() => {
        const min = Math.floor((timeLeft / 1000) / 60);
        const sec = Math.floor((timeLeft / 1000) % 60);

        timerText.innerText = `NEXT CLAIM IN: ${min}m ${sec}s`;
        timeLeft -= 1000;

        if (timeLeft < 0) {
            clearInterval(interval);
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.innerText = "GO";
            timerText.style.display = "none";
            timerText.classList.add('hidden');
        }
    }, 1000);
}

// ৫. গ্লোবাল লোডার (টাইমার রিকভারি)
window.loadEventPageData = function() {
    const missions = [
        { key: 'lastEventTime', btn: 'btn-event-ad', timer: 'timerDisplay' },
        { key: 'lastTadsbtn-tads-ad', timer: 'tadsTimerDisplay' }
    ];

    missions.forEach(m => {
        const lastClick = localStorage.getItem(m.key);
        if (lastClick) {
            const diff = Date.now() - parseInt(lastClick);
            if (diff < EVENT_COOLDOWN) {
                startCountdown(EVENT_COOLDOWN - diff, m.btn, m.timer);
            }
        }
    });
};

// টাস্ক ফাইল থেকে পাঠানো ব্যালেন্স মেইন ফাইলের লোকাল স্কোপে সিঙ্ক করার লিসেনার
window.addEventListener('balanceUpdated', (e) => {
    if (typeof currentUser !== 'undefined') {
        currentUser.pp = (currentUser.pp || 0) + e.detail.amount;
        updateUI(); // মেইন ফাইলের অরিজিনাল UI আপডেট কল করা হলো
    }
});

// অ্যাপ শুরু
init();
