(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(["converse"], factory);
    } else {
        factory(converse);
    }
}(this, function (converse) {
    var rssInterval, mastodonInterval;
    var Strophe, dayjs

    converse.plugins.add("gateway", {
        'dependencies': [],

        'initialize': function () {
            _converse = this._converse;
            Strophe = converse.env.Strophe;
            dayjs = converse.env.dayjs;

            _converse.api.listen.on('getToolbarButtons', function(toolbar_el, buttons)
            {
				const chatview = _converse.chatboxviews.get(toolbar_el.model.get('jid'));	

				if (chatview && chatview.model.get("type") === "chatbox" && chatview.model.get("jid") == "pade-rss@" + _converse.connection.domain) {				
					let form = chatview.getMessageForm();
					
					if (form) {
						form.onFormSubmitted = async (ev) => {
							ev.stopPropagation();
							const textarea = form.querySelector('.chat-textarea');
							const message_text = textarea.value.trim();
							textarea.value = '';					
							textarea.focus();
							console.debug("gateway - typed text " + message_text);
						}
					}
				}
				
                return buttons;
            });
			
            _converse.api.listen.on('beforeMessageBodyTransformed', function(text)
            {	
				if (text.trim().startsWith("RSS:")) {	
					const strings = [text.substr(4)];
					strings.raw = strings;								
					text.addTemplateResult(0, text.length, html(strings));
				}
				else
					
				if (text.trim().startsWith("MASTODON:")) {	
					const strings = [text.substr(9)];
					strings.raw = strings;								
					text.addTemplateResult(0, text.length, html(strings));
				}				
            });

            _converse.api.listen.on('chatRoomViewInitialized', function (view)
            {
				rssGroupChatCheck(view)
			});
			
            _converse.api.listen.on('chatBoxViewInitialized', function (view)
            {
				var jid = view.model.get("jid");
				var type = view.model.get("type");
				console.debug("chatBoxViewInitialized", jid, type);
					
                if (getSetting("enableRssFeeds", false))
                {
                    if (jid === "pade-rss@" + _converse.connection.domain)
                    {
                        if (getSetting("showRssToolbar", false)) {
							const textarea = view.querySelector('.chat-textarea')
                            if (textarea) textarea.setAttribute("disabled", "true");
                        } else {
                            view.querySelector('.bottom-panel').style.display = "none";
                        }
                        rssChatCheck();
                    }
				}
				
				if (getSetting("enableMastodon", false))
				{
                    if (jid === "pade-mastodon@" + _converse.connection.domain)
                    {
                        if (getSetting("showMastodonToolbar", false)) {
							const textarea = view.querySelector('.chat-textarea')
                            if (textarea) textarea.setAttribute("disabled", "true");
                        } else {
                            view.querySelector('.bottom-panel').style.display = "none";
                        }
                        mastodonRefresh();
                    }					
                }
            });

            _converse.api.listen.on('connected', function()
            {
                _converse.api.waitUntil('rosterContactsFetched').then(() => {

					window.addEventListener("unload", function ()
					{
						console.debug("gateway unloading all feed refreshing");

						if (rssInterval) clearInterval(rssInterval);
						if (mastodonInterval) clearInterval(mastodonInterval);
					});

                    if (getSetting("enableMastodon", false))
                    {
						var mastodonCheck = getSetting("mastodonFeedCheck", 30) * 60000;
                        mastodonInterval = setInterval(mastodonRefresh, mastodonCheck);	
						
						const jid = "pade-mastodon@" + _converse.connection.domain;
                        openChat(jid, getSetting("mastodonFeedTitle", "Mastodon Feed"), ["Bots"]);		
					}
					
                    if (getSetting("enableRssFeeds", false))
                    {				
                        var rssFeedCheck = getSetting("rssFeedCheck", 30) * 60000;
                        rssInterval = setInterval(rssRefresh, rssFeedCheck);

						const jid = "pade-rss@" + _converse.connection.domain;
                        openChat(jid, getSetting("rssFeedTitle", "RSS Feed"), ["Bots"]);																	
                    }
                });
            });

            console.log("gateway plugin is ready");
        }
    });		

	function mastodonRefresh()
	{
		mastodonFetch("/api/v1/timelines/public");
		mastodonFetch("/api/v1/timelines/home");		
	}
	
	function mastodonFetch(path)
	{
		console.debug("gateway mastodonRefresh", path);	

		const accessServer =  getSetting("mastodonAccessServer", _converse.connection.domain);
		const mastodonServer =  getSetting("mastodonAccessUrl", "toot.igniterealtime.org");
		const token =  getSetting("mastodonAccessToken", null);				
		const endpoint = "https://" + mastodonServer + path + "?limit=" + getSetting("mastodonPageSize", 25);		
        const iq = $iq({type: 'get', to: accessServer}).c('c2s', {xmlns: 'urn:xmpp:mastodon:0', endpoint, token});

        _converse.connection.sendIQ(iq, function(response)
        {
			const from = "pade-mastodon@" + _converse.connection.domain;			
			const posts = JSON.parse(response.querySelector("json").innerHTML);			
						
			posts.forEach(async function(json)
			{	
				console.debug("gateway mastodonRefresh", path);			
				
				if ((!json.content || json.content == "") && json.reblog?.account) {
					json = json.reblog;		
				}
				
				const user = json.account.username + "@" + _converse.connection.domain;				
                const time = dayjs(json.created_at).format('MMM DD YYYY HH:mm:ss');	
				const msgId = json.id;
				const title = json.account.display_name.trim() == "" ? json.account.username : json.account.display_name;
				const avatar = json.account.avatar_static;	
				const timeAgo = timeago.format(new Date(json.created_at));
				const timeAgoSpan = "<span class=chat-msg__time_span title='" + time + "' datetime='" + json.created_at + "'>" + timeAgo + '</span>';
				const header = "<img width=48 style='border-radius: var(--avatar-border-radius)' src='" + avatar + "'/><br/><b>" + title + ' - ' + timeAgoSpan + "</b> - <a href='" + json.url + "'>Reply<br/>"			
				let footer = "";
				let cardImage = "";

				if (json.card) {
					if (json.card.image) cardImage = '<img src="' + json.card.image + '"/>';				
					footer = `<p>${cardImage}</p><p>${json.card.description}</p><p><a target=_blank href='${json.card.url}'>${json.card.title}</a></p>`
				}
				
				const body = 'MASTODON:' + header + json.content + footer;			
				const attrs = {json, body, message: body, id: msgId, msgId, type: 'chat', from: from, time};  
				//const attrs = {json, body, message: body, id: msgId, msgId, type: 'groupchat', from_muc: user, from: user + '/' + json.account.username, nick: title, time, avatar};				
				chatbox = await _converse.api.chats.get("pade-mastodon@" + _converse.connection.domain, {}, true);
				await (chatbox === null || chatbox === void 0 ? void 0 : chatbox.queueMessage(attrs));						
			})			
			return true;
			
        }, function (error) {
            console.error('mastodonRefresh', error);
        });		
	}

    function rssRefresh()
    {
        rssChatCheck();

        _converse.chatboxes.models.forEach(function(model)
        {
			const view = _converse.chatboxviews.views[model.id];
			
            if (model.get('type') === "chatroom" && view)
            {
                rssGroupChatCheck(view);
            }
        });
    }

    function rssChatCheck()
    {
		const from = "pade-rss@" + _converse.connection.domain;
		const summary = getSetting("showRssSummary");
        var rssUrls = getSetting("rssAtomFeedUrls", "").split("\n");
        console.debug("rssChatCheck", rssUrls, summary, from);

        rssCheckEach(false, rssUrls, "rss-feed-chat-", async(msgId, html, title, delay, json) =>  {	
			const body = 'RSS:' + html;			
			const attrs = {json, body, message: body, id: msgId, msgId, type: 'chat', from, time: delay};  
			chatbox = await _converse.api.chats.get(from, {}, true);
			await (chatbox === null || chatbox === void 0 ? void 0 : chatbox.queueMessage(attrs));
        });
    }

	// https://github.com/igniterealtime/pade/commits/master.atom
	
    function rssGroupChatCheck(view)
    {
		const summary = getSetting("showRssSummary");		
        const id = view.model.get("box_id");
        const from = view.model.get("jid")
        const feedId = 'feed-' + id;

        //console.debug("rssGroupChatCheck", feedId, from, summary, view.model);

        chrome.storage.local.get(feedId, function(data)
        {
            if (data && data[feedId])
            {
                const rssUrls = Object.getOwnPropertyNames(data[feedId]);
                //console.debug("rssGroupChatCheck", feedId, rssUrls, summary);

                rssCheckEach(true, rssUrls, "rss-feed-muc-", async (msgId, html, title, delay, json) => {
					const body = 'RSS:' + html;					
					const attrs = {json, body, message: body, id: msgId, msgId, type: 'groupchat', from_muc: from, from: from + '/' + title, nick: title, time: delay};  
					view.model.queueMessage(attrs);					
                });
            }
        });
    }

    function rssCheckEach(groupChat, rssUrls, prefix, callback)
    {
        rssUrls.forEach(function(rssUrl)
        {
            if (!rssUrl || rssUrl == "") return;

            // when pade.chat (pwa), use proxy servlet in pade openfire plugin to fetch feed URL contents and avoid CORS

            var feed = {
                path: chrome.pade ? (getSetting("domain") == "localhost" || location.protocol == "http:" ? "http://" : "https://") + getSetting("server") + "/pade/download?url=" + rssUrl : rssUrl
            }

            fetch(feed.path).then(function(response)
            {
                //console.debug("RSSParser", feed, response)

                if (response.ok)
                {
                    return response.text().then(function(body)
                    {
                        var parser = new RSSParser(feed);
                        parser.setResult(body);

                        parser.parse(function(parser)
                        {
                            parser.posts.forEach(function(post)
                            {
                                //console.debug("rssCheckEach pre", post.title, post);

                                var stamp = dayjs(post.published_from_feed).format('MMM DD YYYY HH:mm:ss');
                                var delay = dayjs(post.published_from_feed).format('YYYY-MM-DDTHH:mm:ssZ');

                                var msgId = prefix + btoa(post.guid);

                                if (post.title && post.title.trim() != "")
                                {
                                    let htmlTemp = (groupChat ? stamp : "" + feed.title.toUpperCase() + " - " + stamp) + "<br/><b><a target='_blank' href='" + post.link + "'>" + post.title + "</a></b>";

                                    if (getSetting("showRssSummary", false))
                                    {
                                        htmlTemp = htmlTemp + "<br/>" + post.summary.replace(/<a /g, '<a target=_blank ');
                                    }
                                    htmlTemp = htmlTemp + "<p/>";

                                    //console.debug("rssCheckEach post", htmlTemp);

                                    if (callback)
                                    {
                                        callback(msgId, htmlTemp, feed.title, delay, post);									
                                    }
                                }
                            });
                        });
                    });
                } else {
                    console.error("rssCheckEach", response)
                }
            }).catch(function (err) {
                console.error("rssCheckEach", err)
            });
        });
    }
}));
