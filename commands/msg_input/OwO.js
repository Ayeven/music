const owofy = require('owofy');
const { Constants, Message } = require('discord.js');
const type = Constants.ApplicationCommandTypes;
module.exports = {
	name:'OwO',
	type:type.MESSAGE,
	guildOnly: false,
	/**
    * @param {import('discord.js').ContextMenuInteraction} interaction - Represent contextmenu interaction
   	*/
	async contextmenu(interaction) {
		try {
			await interaction.deferReply();
			const message = interaction.options.getMessage('message');
			if (message instanceof Message) {
				const content = message?.cleanContent;
				if (content) {
					// @ts-expect-error
					return interaction.editReply({ content: `${owofy(content)}` });
				}
				else {
					const result = [];
					const faces = Math.floor(Math.random() * owofy.faces.length);
					result.push(owofy.faces[faces]);
					// @ts-expect-error
					return interaction.editReply({ content:`${owofy('There is no message content nyaa!!!')} ${result.join('\t')}` });
				}
			}
		}
		catch (error) {
			console.warn(error);
			return interaction.editReply({ content:'Something Wrong with the Message Input Interaction command' });
		}
	},
};