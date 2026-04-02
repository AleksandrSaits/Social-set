// ==================== SUPABASE CONFIG ====================
var SUPABASE_URL = 'https://imxgdbztadqkpkrlebnh.supabase.co';
var SUPABASE_KEY = 'sb_publishable_xP_iYqZ-UJWXCb5b3pttRA_rMH9Fhe2';
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==================== STATE ====================
var currentUser = null;
var isLoginMode = true;
var currentVideoId = null;
var currentPage = 1;
var isLoading = false;
var notifications = [];
var viewHistory = [];
var currentTheme = 'dark';
var sidebarOpen = false;
var videoElement = null;

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', function() {
    try {
        var stored = localStorage.getItem('zeroTubeHistory');
        if (stored) viewHistory = JSON.parse(stored);
        currentTheme = localStorage.getItem('zeroTubeTheme') || 'dark';
    } catch(e) {}
    setTheme(currentTheme);
    checkSession();
    routerInit();
    loadNotifications();
});

// ==================== ROUTER ====================
var router = {
    navigate: function(route, params) {
        var hash = '#' + route;
        if (params && params.id) hash += '?id=' + params.id;
        window.location.hash = hash;
        updateBottomNav();
        if (window.innerWidth <= 768) toggleSidebar();
    }
};

function routerInit() {
    window.addEventListener('hashchange', routerHandleRoute);
    routerHandleRoute();
}

function routerNavigate(route, id) {
    router.navigate(route, id ? {id: id} : {});
}

function routerHandleRoute() {
    var hash = window.location.hash.slice(1) || 'home';
    var parts = hash.split('?');
    var route = parts[0];
    var params = {};
    if (parts[1]) {
        var sp = new URLSearchParams(parts[1]);
        params.id = sp.get('id');
        params.q = sp.get('q');
    }

    var main = document.getElementById('mainContent');
    main.innerHTML = '<div class="text-center" style="padding:100px;"><div class="loading-spinner" style="margin:0 auto 20px;"></div><p class="text-muted">Loading...</p></div>';
    window.scrollTo(0, 0);

    setTimeout(function() {
        if (route === 'home') renderHome(main, params.q);
        else if (route === 'video') renderVideo(main, params.id);
        else if (route === 'channel') renderChannel(main, params.id);
        else if (route === 'history') renderHistory(main);
        else if (route === 'trending') renderHome(main);
        else router.navigate('home');
    }, 100);
}

// ==================== THEME ====================
function setTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('zeroTubeTheme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    var icon = document.getElementById('themeIcon');
    if (icon) icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

function toggleThemeDropdown() {
    document.getElementById('themeDropdown').classList.toggle('active');
}

// ==================== SIDEBAR ====================
function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    sidebarOpen = !sidebarOpen;
    sidebar.classList.toggle('active', sidebarOpen);
    overlay.classList.toggle('active', sidebarOpen);
}

// ==================== BOTTOM NAV ====================
function updateBottomNav() {
    var hash = window.location.hash.slice(1) || 'home';
    document.querySelectorAll('.bottom-nav-item').forEach(function(item) {
        item.classList.remove('active');
        if (hash === 'home' && item.innerText.includes('Home')) item.classList.add('active');
        if (hash === 'trending' && item.innerText.includes('Explore')) item.classList.add('active');
    });
}

function toggleUserDropdownMobile() {
    if (currentUser) document.getElementById('userDropdown').classList.toggle('active');
    else openAuthModal('login');
}

// ==================== AUTH ====================
async function checkSession() {
    try {
        var result = await supabase.auth.getSession();
        if (result.data.session) {
            currentUser = result.data.session.user;
            await fetchUserProfile();
            updateUIForAuth(true);
        }
    } catch(e) {
        var stored = localStorage.getItem('zeroTubeUser');
        if (stored) {
            currentUser = JSON.parse(stored);
            updateUIForAuth(true);
        }
    }
}

async function fetchUserProfile() {
    if (!currentUser) return;
    try {
        var result = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        if (result.data) {
            currentUser.profile = result.data;
            var avatar = document.getElementById('navAvatar');
            if (avatar) avatar.src = result.data.avatar_url || 'https://via.placeholder.com/36';
        }
    } catch(e) {}
}

function updateUIForAuth(isLoggedIn) {
    var authBtns = document.getElementById('authButtons');
    var userMenu = document.getElementById('userMenu');
    if (isLoggedIn) {
        authBtns.classList.add('hidden');
        userMenu.classList.remove('hidden');
        if (currentUser && currentUser.profile) {
            document.getElementById('navAvatar').src = currentUser.profile.avatar_url || 'https://via.placeholder.com/36';
        }
    } else {
        authBtns.classList.remove('hidden');
        userMenu.classList.add('hidden');
    }
}

function openAuthModal(mode) {
    isLoginMode = mode === 'login';
    document.getElementById('authTitle').innerText = isLoginMode ? 'Sign In' : 'Sign Up';
    document.getElementById('authSwitchText').innerHTML = isLoginMode 
        ? 'No account? <span class="text-accent" style="cursor:pointer" onclick="toggleAuthMode()">Sign Up</span>'
        : 'Have account? <span class="text-accent" style="cursor:pointer" onclick="toggleAuthMode()">Sign In</span>';
    document.getElementById('authModal').classList.add('active');
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    openAuthModal(isLoginMode ? 'login' : 'signup');
}

async function handleAuth(e) {
    e.preventDefault();
    var email = document.getElementById('authEmail').value;
    var password = document.getElementById('authPassword').value;
    var btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Loading...';

    try {
        var result;
        if (isLoginMode) result = await supabase.auth.signInWithPassword({email:email,password:password});
        else result = await supabase.auth.signUp({email:email,password:password});
        if (result.error) throw result.error;

        currentUser = result.data.user;
        if (!isLoginMode) await supabase.from('profiles').insert([{id:currentUser.id,username:email.split('@')[0]}]);
        await fetchUserProfile();
        updateUIForAuth(true);
        closeModal('authModal');
        showToast(isLoginMode ? 'Welcome!' : 'Account created!', 'success');
        router.navigate('home');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Submit';
    }
}

async function logout() {
    await supabase.auth.signOut();
    currentUser = null;
    updateUIForAuth(false);
    router.navigate('home');
    showToast('Logged out', 'success');
}

// ==================== HOME ====================
async function renderHome(container, searchQuery) {
    var categories = ['All', 'Gaming', 'Music', 'Tech', 'Education'];
    var html = '<div class="category-bar">';
    categories.forEach(function(cat, i) {
        html += '<div class="category-pill touch-feedback ' + (i === 0 ? 'active' : '') + '" onclick="filterCategory(this)">' + cat + '</div>';
    });
    html += '</div><div class="video-grid" id="videoGrid"></div>';
    container.innerHTML = html;
    await loadVideos(searchQuery, true);
}

function filterCategory(el) {
    document.querySelectorAll('.category-pill').forEach(function(p) { p.classList.remove('active'); });
    el.classList.add('active');
}

async function loadVideos(query, reset) {
    if (isLoading) return;
    isLoading = true;
    var grid = document.getElementById('videoGrid');
    if (!grid) { isLoading = false; return; }
    if (reset) { grid.innerHTML = ''; currentPage = 1; }

    try {
        var q = supabase.from('videos').select('*,profiles:user_id(username,avatar_url)').order('created_at',{ascending:false}).range((currentPage-1)*12,currentPage*12-1);
        if (query) q = q.or('title.ilike.%'+query+'%');
        var result = await q;
        var data = result.data;
        if (data && data.length > 0) {
            data.forEach(function(v) {
                v.channel_name = v.profiles ? v.profiles.username : 'Unknown';
                v.channel_avatar = v.profiles ? v.profiles.avatar_url : 'https://via.placeholder.com/40';
                grid.appendChild(createVideoCard(v));
            });
            currentPage++;
        }
    } catch (e) {
        console.error(e);
        var demo = generateDemoVideos();
        demo.forEach(function(v) { grid.appendChild(createVideoCard(v)); });
    }
    isLoading = false;
}

function generateDemoVideos() {
    var videos = [];
    for (var i = 0; i < 12; i++) {
        videos.push({
            id: 'demo-'+i,
            title: 'Demo Video '+(i+1),
            thumbnail_url: 'https://picsum.photos/seed/'+i+'/640/360',
            channel_name: 'Channel '+(i+1),
            channel_avatar: 'https://picsum.photos/seed/'+(i+100)+'/40/40',
            views: Math.floor(Math.random()*100000),
            created_at: new Date().toISOString()
        });
    }
    return videos;
}

function createVideoCard(video) {
    var div = document.createElement('div');
    div.className = 'video-card touch-feedback';
    div.onclick = function() { router.navigate('video', {id:video.id}); };
    div.innerHTML = '<div class="thumbnail-wrapper"><img src="'+(video.thumbnail_url||'https://via.placeholder.com/640x360')+'" class="thumbnail" loading="lazy"></div><div class="video-info"><img src="'+(video.channel_avatar||'https://via.placeholder.com/40')+'" class="channel-thumb"><div class="video-meta"><h3 class="video-title">'+sanitizeHTML(video.title)+'</h3><div class="channel-name">'+sanitizeHTML(video.channel_name||'Unknown')+'</div><div class="video-stats">'+formatNumber(video.views||0)+' views</div></div></div>';
    return div;
}

// ==================== VIDEO PLAYER ====================
async function renderVideo(container, videoId) {
    currentVideoId = videoId;
    var video = {id:videoId,title:'Sample Video',video_url:'https://www.w3schools.com/html/mov_bbb.mp4',description:'Video description here',views:1000,channel_name:'Test Channel',channel_avatar:'https://via.placeholder.com/44',subscribers:'10K'};
    var html = '<div class="player-layout"><div class="main-player"><div class="video-player-container"><div class="custom-player" id="customPlayer"><video id="mainVideo" preload="metadata"><source src="'+video.video_url+'" type="video/mp4"></video><div class="player-controls"><div class="progress-bar" id="progressBar" onclick="seekVideo(event)"><div class="progress-filled" id="progressFilled"></div></div><div class="controls-row"><div class="controls-left"><button class="control-btn touch-feedback" onclick="togglePlay()"><i class="fas fa-play" id="playIcon"></i></button><span class="time-display"><span id="currentTime">0:00</span></span></div></div></div></div></div><div class="video-info-section"><h1 class="video-title-large">'+sanitizeHTML(video.title)+'</h1><div class="video-actions-bar"><div class="action-buttons"><button class="action-btn touch-feedback" id="likeBtn" onclick="toggleLike()"><i class="fas fa-thumbs-up"></i><span>Like</span></button></div></div></div><div class="channel-info-bar"><div class="channel-info-left"><img src="'+video.channel_avatar+'" class="channel-avatar-lg"><div class="channel-details"><h4>'+sanitizeHTML(video.channel_name)+'</h4><p>'+video.subscribers+' subscribers</p></div></div><button class="subscribe-btn touch-feedback" onclick="toggleSubscribe()">Subscribe</button></div><div class="video-description"><div class="desc-content">'+sanitizeHTML(video.description)+'</div></div><div class="comments-section"><div class="comments-header"><h3>Comments</h3></div>'+(currentUser?'<div class="comment-input-container"><img src="'+(currentUser.profile?currentUser.profile.avatar_url:'https://via.placeholder.com/40')+'" class="comment-avatar"><div class="comment-input-wrapper"><textarea class="comment-input" id="commentInput" placeholder="Add a comment..."></textarea><div class="comment-actions"><button class="comment-btn comment-btn-submit touch-feedback" onclick="postComment()">Comment</button></div></div></div>':'<p class="text-muted">Sign in to comment</p>')+'<div id="commentsList"></div></div></div><div class="suggestions-sidebar"><h3>Up Next</h3><div class="suggestions-list" id="suggestionsList"></div></div></div>';
    container.innerHTML = html;
    initVideoPlayer();
    loadComments();
    loadSuggestions();
}

function initVideoPlayer() {
    videoElement = document.getElementById('mainVideo');
    if (!videoElement) return;
    videoElement.addEventListener('timeupdate', function() {
        var pct = (videoElement.currentTime / videoElement.duration) * 100;
        document.getElementById('progressFilled').style.width = pct + '%';
        document.getElementById('currentTime').innerText = formatTime(videoElement.currentTime);
    });
}

function togglePlay() {
    if (!videoElement) return;
    var icon = document.getElementById('playIcon');
    if (videoElement.paused) { videoElement.play(); icon.className = 'fas fa-pause'; }
    else { videoElement.pause(); icon.className = 'fas fa-play'; }
}

function seekVideo(e) {
    if (!videoElement) return;
    var bar = document.getElementById('progressBar');
    var rect = bar.getBoundingClientRect();
    var pos = (e.clientX - rect.left) / rect.width;
    videoElement.currentTime = pos * videoElement.duration;
}

function toggleLike() {
    if (!currentUser) { openAuthModal('login'); return; }
    var btn = document.getElementById('likeBtn');
    btn.classList.toggle('active');
    showToast(btn.classList.contains('active') ? 'Liked!' : 'Unliked', 'success');
}

function toggleSubscribe() {
    if (!currentUser) { openAuthModal('login'); return; }
    var btn = document.querySelector('.subscribe-btn');
    btn.classList.toggle('subscribed');
    btn.innerText = btn.classList.contains('subscribed') ? 'Subscribed' : 'Subscribe';
    showToast('Done!', 'success');
}

function loadComments() {
    var list = document.getElementById('commentsList');
    if (!list) return;
    list.innerHTML = '<p class="text-muted">No comments yet</p>';
}

function postComment() {
    var input = document.getElementById('commentInput');
    if (!input || !input.value.trim()) return;
    var list = document.getElementById('commentsList');
    if (list.innerHTML.includes('No comments')) list.innerHTML = '';
    list.insertAdjacentHTML('afterbegin', '<div class="comment-item"><img src="'+(currentUser.profile?currentUser.profile.avatar_url:'https://via.placeholder.com/40')+'" class="comment-avatar"><div class="comment-body"><div class="comment-meta"><span class="comment-author">'+sanitizeHTML(currentUser.profile?currentUser.profile.username:'User')+'</span></div><div class="comment-text">'+sanitizeHTML(input.value)+'</div></div></div>');
    input.value = '';
    showToast('Comment posted!', 'success');
}

function loadSuggestions() {
    var list = document.getElementById('suggestionsList');
    if (!list) return;
    list.innerHTML = '';
    for (var i = 0; i < 5; i++) {
        list.innerHTML += '<div class="suggestion-card touch-feedback"><img src="https://picsum.photos/seed/'+i+'/160/90" class="suggestion-thumb"><div class="suggestion-info"><h4 class="suggestion-title">Suggested Video '+(i+1)+'</h4><div class="suggestion-channel">Channel</div></div></div>';
    }
}

// ==================== CHANNEL ====================
function renderChannel(container, userId) {
    container.innerHTML = '<div class="channel-banner"></div><div class="channel-header-card"><img src="https://via.placeholder.com/88" class="channel-avatar-xl"><div class="channel-header-info"><h1>Channel Name</h1><p>1K subscribers</p></div><button class="subscribe-btn touch-feedback">Subscribe</button></div><div class="channel-tabs"><div class="channel-tab active">Videos</div></div><div class="video-grid"></div>';
}

// ==================== HISTORY ====================
function renderHistory(container) {
    container.innerHTML = '<h2>Watch History</h2><div class="video-grid" style="margin-top:16px;"></div>';
}

// ==================== UPLOAD ====================
function openUploadModal() {
    if (!currentUser) { openAuthModal('login'); return; }
    document.getElementById('uploadModal').classList.add('active');
}

async function handleUpload(e) {
    e.preventDefault();
    var title = document.getElementById('vidTitle').value;
    var url = document.getElementById('vidUrl').value;
    var thumb = document.getElementById('vidThumb').value;
    var desc = document.getElementById('vidDesc').value;
    try {
        await supabase.from('videos').insert([{user_id:currentUser.id,title:title,video_url:url,thumbnail_url:thumb,description:desc}]);
        closeModal('uploadModal');
        showToast('Video published!', 'success');
        router.navigate('home');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ==================== PLAYLISTS ====================
function openPlaylistsModal() {
    if (!currentUser) { openAuthModal('login'); return; }
    document.getElementById('playlistsModal').classList.add('active');
    document.getElementById('playlistsList').innerHTML = '<p class="text-muted">No playlists yet</p>';
}

function createPlaylist() {
    var name = document.getElementById('newPlaylistName').value.trim();
    if (!name) return;
    showToast('Playlist "'+name+'" created!', 'success');
    document.getElementById('newPlaylistName').value = '';
}

// ==================== NOTIFICATIONS ====================
function loadNotifications() {
    var stored = localStorage.getItem('zeroTubeNotifications');
    if (stored) notifications = JSON.parse(stored);
    updateNotificationBadge();
}

function updateNotificationBadge() {
    var unread = notifications.filter(function(n) { return !n.read; }).length;
    var badge = document.getElementById('notifBadge');
    badge.innerText = unread > 9 ? '9+' : unread;
    badge.classList.toggle('hidden', unread === 0);
}

function toggleNotifications() {
    var panel = document.getElementById('notificationsPanel');
    panel.classList.toggle('active');
    if (panel.classList.contains('active')) {
        var list = document.getElementById('notificationsList');
        list.innerHTML = notifications.length ? notifications.map(function(n) { return '<div class="notification-item '+(n.read?'':'unread')+'"><div class="notification-icon '+n.type+'"><i class="fas fa-'+(n.type==='like'?'thumbs-up':'comment')+'"></i></div><div class="notification-content"><div class="notification-text">'+n.title+'</div><div class="notification-time">'+formatTimeAgo(new Date(n.time))+'</div></div></div>'; }).join('') : '<p class="text-muted" style="padding:20px;">No notifications</p>';
    }
}

function markAllRead() {
    notifications.forEach(function(n) { n.read = true; });
    localStorage.setItem('zeroTubeNotifications', JSON.stringify(notifications));
    updateNotificationBadge();
    toggleNotifications();
}

// ==================== UTILS ====================
function closeModal(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

function toggleUserDropdown() {
    document.getElementById('userDropdown').classList.toggle('active');
}

function handleSearch() {
    var q = document.getElementById('searchInput').value.trim();
    if (q) router.navigate('home', {q:q});
}

function showToast(msg, type) {
    var container = document.getElementById('toastContainer');
    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || '');
    toast.innerHTML = '<i class="fas fa-'+(type==='error'?'exclamation-circle':'check-circle')+'"></i><span>'+sanitizeHTML(msg)+'</span>';
    container.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3000);
}

function sanitizeHTML(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatNumber(num) {
    if (num >= 1000000) return (num/1000000).toFixed(1)+'M';
    if (num >= 1000) return (num/1000).toFixed(1)+'K';
    return num.toString();
}

function formatTime(sec) {
    if (!sec) return '0:00';
    var m = Math.floor(sec/60);
    var s = Math.floor(sec%60);
    return m+':'+String(s).padStart(2,'0');
}

function formatTimeAgo(date) {
    var sec = Math.floor((new Date() - date)/1000);
    if (sec < 60) return 'Just now';
    var min = Math.floor(sec/60);
    if (min < 60) return min+'m ago';
    var hr = Math.floor(min/60);
    if (hr < 24) return hr+'h ago';
    return Math.floor(hr/24)+'d ago';
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('click', function(e) {
    if (!e.target.closest('.theme-toggle')) document.getElementById('themeDropdown').classList.remove('active');
    if (!e.target.closest('.user-menu')) document.getElementById('userDropdown').classList.remove('active');
    if (!e.target.closest('#notifBtn')) document.getElementById('notificationsPanel').classList.remove('active');
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active,.theme-dropdown.active,.user-dropdown.active,.notifications-panel.active').forEach(function(el) { el.classList.remove('active'); });
    }
});
