const { SoundCloud } = require('scdl-core');
const soundcloud = new SoundCloud();
const { Playlist } = require('../../dependancies/playlist');
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { Track } = require('../../dependancies/track');
const { MessageSelectMenu, MessageEmbed, MessageButton, GuildMember, Constants, Collection, Message } = require('discord.js');
/**
* @type {Collection<string, import('scdl-core').Track[]>}
*/
const tracklist = new Collection();
const moment = require('dayjs');
const dura = require('dayjs/plugin/duration');
moment.extend(dura);
const opt = Constants.ApplicationCommandOptionTypes;
const delay = require('timers/promises').setTimeout;
module.exports = {
	name: 'sc',
	description: 'Search tracks from soundcloud platform',
	guildOnly: false,
	cooldown: 5,
	options:[
		{
			type: opt.SUB_COMMAND,
			name: 'track',
			description: 'The song name you want to search for!',
			options: [
				{
					type: opt.STRING,
					name: 'song_name',
					description: 'The song title you looking for',
					required: true,
				},
			],
		},
	],
	/**
   * @param {import('discord.js').CommandInteraction} interaction - Represents a command interaction.
   */
	async slashcommand(interaction) {

		try {
			await interaction.deferReply({ fetchReply: true });
			await soundcloud.connect();
			const me = interaction.guild.me;
			const invitebutton = new MessageButton({
				label:'Link with voice',
				url:`${interaction.client.generateInvite({ scopes: ['applications.commands', 'bot'], permissions: ['SPEAK', 'CONNECT'] })}`,
				style: 'LINK',
			});

			if (!me.permissions.has(['CONNECT', 'SPEAK'])) {
				return interaction.editReply({ content: 'I don\'t have permission to join/speak in voice channel! Reauthorize me with the link below', components: [{ type: 'ACTION_ROW', components:[invitebutton] }] });
			}

			if (interaction.options.getSubcommand() === 'track') {
				const query = interaction.options.getString('song_name');
				const fetch = await soundcloud.search({ query: query, limit: 25, filter: 'tracks' });
				/**
				 * @type {import('scdl-core').Track[]}
				 */
				// @ts-expect-error
				const result = fetch.collection;
				const songSelectMenu = new MessageSelectMenu({
					customId: `${this.name}`,
					placeholder:'Select a track to play',
				});
				const embedArray = [];
				for (let i = 0;i < result.length;i++) {
					const duration = moment.duration(result[i].duration, 'milliseconds').format('HH:mm:ss');
					embedArray.push(`[${(i + 1).toString().padStart(2, '0')}) ${duration} | ${result[i].title}](${result[i].uri})`);
					songSelectMenu.addOptions([
						{
							label: `${(i + 1).toString().padStart(2, '0')}`,
							description:`${duration} | ${result[i].title}`.slice(0, 98),
							value:`${i}`,
						},
					]);
				}
				tracklist.set(interaction.guildId, result);
				const embed = new MessageEmbed(
					{
						color:'RANDOM',
						description: `${embedArray.join('\n')}\n\n**You have around 3 minutes to choose track(s) from the list. If there is new search command invoked, the newest command will take effect**`,
					},
				);
				await interaction.editReply({ embeds: [embed], components: [{ type:'ACTION_ROW', components: [songSelectMenu] }] });
				await delay(3 * 60 * 1000);
				await interaction.editReply({ content:'3minutes choosing track(s) come to an end!', components: [], embeds: [] });
				const message = await interaction.fetchReply();
				tracklist.delete(interaction.guildId);
				await delay(7 * 60 * 1000);
				if (message instanceof Message && (!message.deleted)) {
					await message.delete()
						.catch(()=>{void null;});
				}
			}

		}
		catch (err) {
			console.warn(err);
			void interaction.editReply('Something wrong with the SlashCommand command')
				.catch(()=> {console.warn(err);});
		}
	},
	/**
   	* @param {import('discord.js').SelectMenuInteraction} interaction - Represents a SelectMenu Interaction
	* @param {import('discord.js').Collection} _appcommands
	* @param {import('discord.js').Collection<string, Playlist>} playlist
   	*/
	async selectmenu(interaction, _appcommands, playlist) {
		try {
			await interaction.deferUpdate();
			let list = playlist.get(interaction.guildId);
			const videos = tracklist.get(interaction.guildId);
			const songSelectMenu = new MessageSelectMenu({
				customId: `${this.name}`,
				placeholder:'Select a song to play',
			});
			if (!videos) { return interaction.editReply({ content: 'Another search is invoked or time is up! The latest search command will be used', components: [] }); }
			for (let n = 0; n < videos.length; n++) {
				const duration = moment.duration(videos[n].duration, 'milliseconds').format('HH:mm:ss');
				songSelectMenu.addOptions([
					{
						label: `${(n + 1).toString().padStart(2, '0')}`,
						description: `${duration} | ${videos[n].title}`.slice(0, 98),
						value: `${n}`,
					},
				]);
			}
			const url = videos[Number(interaction.values[0])].uri;
			const title = videos[Number(interaction.values[0])].title;
			if (!list) {
				if (interaction.member instanceof GuildMember) {
					if (interaction.member.voice.channel && interaction.member) {
						const channel = interaction.member.voice.channel ;
						list = new Playlist(
							joinVoiceChannel({
								channelId: channel.id,
								guildId: channel.guild.id,
								adapterCreator: channel.guild.voiceAdapterCreator,
							}),
						);
						list.voiceConnection.on('error', console.warn);
						playlist.set(interaction.guildId, list);
					}
				}
			}
			if (!list) {
				return interaction.editReply({ content: 'Join a voice channel and then try that again!' });
			}
			await entersState(list.voiceConnection, VoiceConnectionStatus.Ready, 20e3);
			const track = await Track.from(url, title, {
				async onStart() {
					if(interaction.message instanceof Message && (!interaction.message.deleted)) {
						void interaction.message.edit({ content:`Playing: **${title}**`, embeds: [] })
							.catch(()=>{ void null; });
					}
				},
				async onFinish() {
					if (interaction.message instanceof Message && (!interaction.message.deleted)) {
						await interaction.message.edit({ content: `Finished playing: **${title}**`, embeds: [] })
							.catch(() => { void null; });
						await delay(10 * 1000);
						if (list.audioPlayer.state.status === 'idle'
						&& list.voiceConnection.state.status !== VoiceConnectionStatus.Destroyed) {
							list.voiceConnection.destroy();
							playlist.delete(interaction.guildId);
							return interaction.message.delete()
								.catch(()=> { return; });
						}
						else {
							await delay(10 * 1000);
							return interaction.message.delete()
								.catch(()=> { return; });
						}
					}
				},
				/** @param {{ message: any; }} error */
				async onError(error) {
					console.warn(error);
					if (interaction.message instanceof Message) {
						return interaction.message.edit({ content: `Error: ${error.message}`, embeds: [] })
							.catch(()=> {return;});
					}
					else {return;}
				},
			});
			list.enqueue(track);
			return interaction.editReply({ content:`Queued: ${track.title}\n\n**You have around 3 minutes to choose track(s) from the list. If there is new search command invoked, the newest command will take effect**`,
				embeds:[] });

		}
		catch (err) {
			return interaction.editReply('Something wrong with the SlashCommand command')
				.catch(()=> {console.warn(err);});
		}
	},
};