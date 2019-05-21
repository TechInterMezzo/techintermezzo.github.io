var names = ['asterpewpew', 'aynaci', 'bonjwa', 'chefkochx', 'chriddel_hs', 'cocobane', 'dekarldent', 'furkitv',
    'gerrit', 'jay_corner', 'melody_xvr', 'nayuma', 'puffreischen', 'sachsenletsplayeryt', 'scheppertlive', 'scud__',
    'sefron10', 'snackbaron1337', 'torrotourettetv', 'touristhistories', 'valle', 'vanhighnrich'];

Vue.component('streamer', {
    props: ['time', 'streamer'],
    computed: {
        active: function() {
            return !!this.streamer.activeVideo;
        },
        progress: function() {
            if (this.streamer.activeVideo) {
                return Math.round((this.time - this.streamer.activeVideo.start) / this.streamer.activeVideo.duration * 100);
            }
            return 0;
        },
        link: function() {
            if (this.streamer.activeVideo) {
                let duration = luxon.Duration.fromMillis(this.time - this.streamer.activeVideo.start);
                return 'https://www.twitch.tv/videos/' + this.streamer.activeVideo.id
                    + '?t=' + duration.toFormat("h'h'm'm's's'");
            }
            return null;
        }
    }
});

var vm = new Vue({
    el: '#controller',
    data: {
        time: Number(Cookies.get('time')) || (luxon.DateTime.local().valueOf() - 60 * 1000),
        streamers: [],
        modal: false,
        editTime: ''
    },
    methods: {
        play: function(streamer) {
            if (streamer && streamer.activeVideo) {
                Synchronizer.playVideo(streamer.activeVideo);
            }
        },
        edit: function() {
            player.pause();
            this.editTime = luxon.DateTime.fromMillis(this.time).toFormat('dd.MM.yyyy HH:mm:ss');
            this.modal = true;
        },
        cancel: function() {
            this.modal = false;
            player.play();
        },
        save: function() {
            this.time = luxon.DateTime.fromFormat(this.editTime, 'dd.MM.yyyy HH:mm:ss').valueOf();
            Synchronizer.updateStreamers();
            Synchronizer.playVideo(Synchronizer.findFirstActiveVideo());
            this.modal = false;
        }
    },
    filters: {
        formatTime: function(value) {
            return luxon.DateTime.fromMillis(value).toFormat('dd.MM.yyyy HH:mm:ss');
        }
    }
});

var player = new Twitch.Player('player', {
    width: '100%',
    height: '100%'
});
player.addEventListener(Twitch.Player.READY, function(){
    apiReady.then(() => {
        Synchronizer.updateStreamers();
        Synchronizer.playVideo(Synchronizer.findFirstActiveVideo());
    });
});
player.addEventListener(Twitch.Player.PLAYING, () => Synchronizer.startUpdater());
player.addEventListener(Twitch.Player.PAUSE, () => Synchronizer.stopUpdater());
player.addEventListener(Twitch.Player.ENDED, () => Synchronizer.stopUpdater());

var Synchronizer = {
    activeVideo: null,
    updateInterval: null,
    playVideo: function(video) {
        this.activeVideo = video;
        let offset = video.start ? Math.round((vm.time - video.start) / 1000) : 0;
        player.setVideo('v' + video.id, offset);
        player.seek(offset);
    },
    startUpdater: function() {
        clearInterval(this.updateInterval);
        this.updateActivity();
        this.updateInterval = setInterval(() => this.updateActivity(), 1000);
    },
    stopUpdater: function() {
        clearInterval(this.updateInterval);
    },
    updateActivity: function() {
        let offset = player.getCurrentTime() * 1000;
        if (offset && player.getVideo() == 'v' + this.activeVideo.id) {
            vm.time = this.activeVideo.start + offset;
            Cookies.set('time', vm.time, { expires: 30 });
        }
        this.updateStreamers();
    },
    updateStreamers: function() {
        for (let streamer of vm.streamers) {
            streamer.activeVideo = this.findActiveVideo(streamer);
        }
    },
    findActiveVideo: function(streamer) {
        if (streamer.activeVideo && streamer.activeVideo.start <= vm.time && streamer.activeVideo.start + streamer.activeVideo.duration > vm.time) {
            return streamer.activeVideo;
        }
        for (let video of streamer.videos) {
            if (video.start <= vm.time && video.start + video.duration > vm.time) {
                return video;
            }
        }
        return null;
    },
    findFirstActiveVideo() {
        for (let streamer of vm.streamers) {
            if (streamer.activeVideo) {
                return streamer.activeVideo;
            }
        }
        return null;
    },
};

var TwitchApi = {
    client: axios.create({
        baseURL: 'https://api.twitch.tv/helix/',
        headers: { 'Client-ID': 'fabwdpeksbti4wrcrjatakxnvxrqe6' }
    }),
    getUsers: function(names) {
        return this.client.get('users?login=' + names.join('&login=')).then(response => {
            return response.data.data;
        });
    },
    getVideos: function(userId) {
        return this.client.get('videos?type=archive&first=15&user_id=' + userId).then(response => {
            return response.data.data;
        });
    }
};

var apiReady = TwitchApi.getUsers(names).then(users => {
    return vm.streamers = users.map(user => ({
        id: user.id,
        name: user.display_name,
        alias: '',
        activeVideo: null,
        videos: []
    }));
}).then(streamers => {
    var promises = [];
    for (let streamer of streamers) {
        promises.push(TwitchApi.getVideos(streamer.id).then(videos => {
            streamer.videos = videos.map(video => ({
                id: video.id,
                start: luxon.DateTime.fromISO(video.created_at).valueOf(),
                duration: luxon.Duration.fromISO('PT' + video.duration.toUpperCase()).valueOf()
            }));
        }));
    }
    return Promise.all(promises);
});