const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket-add')
        .setDescription('Add a user to the ticket')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to add')
                .setRequired(true)),
    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const channel = interaction.channel;

        if (!channel.name.startsWith('ticket-')) {
            return await interaction.reply({ content: 'You can only use this command in a ticket channel.', ephemeral: true });
        }

        await channel.permissionOverwrites.create(user, { ViewChannel: true });
        await interaction.reply({ content: `${user} has been added to the ticket.` });
    },
};
