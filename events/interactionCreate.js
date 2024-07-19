const { InteractionType, PermissionsBitField, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { STAFF_ROLE_ID, AUDIT_LOG_CHANNEL_ID } = require('../config');  

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (interaction.isCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing ${interaction.commandName}:`, error);
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }

        if (interaction.type === InteractionType.MessageComponent) {
            if (interaction.customId === 'create_ticket') {
                // Check if the user already has an open ticket
                const openTickets = interaction.guild.channels.cache.filter(channel => 
                    channel.name.startsWith('ticket-') && 
                    channel.permissionOverwrites.cache.some(perm => perm.id === interaction.user.id)
                );

                if (openTickets.size > 0) {
                    return await interaction.reply({ content: 'You already have an open ticket.', ephemeral: true });
                }

                const modal = new ModalBuilder()
                    .setCustomId('ticket_modal')
                    .setTitle('Create Ticket')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('in_game_name')
                                .setLabel("What's your in game name?")
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        ),
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('occurrence_location')
                                .setLabel('Where is this occurring?')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        ),
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('help_description')
                                .setLabel('How can we help you?')
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(true)
                        ),
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('additional_info')
                                .setLabel('Additional Information')
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(false)
                        )
                    );

                await interaction.showModal(modal);
            } else if (interaction.customId === 'close_ticket') {
                const modal = new ModalBuilder()
                    .setCustomId('close_ticket_modal')
                    .setTitle('Close Ticket')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('close_reason')
                                .setLabel('Reason for closing the ticket')
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(true)
                        )
                    );

                await interaction.showModal(modal);
            }
        }

        if (interaction.type === InteractionType.ModalSubmit) {
            if (interaction.customId === 'ticket_modal') {
                const inGameName = interaction.fields.getTextInputValue('in_game_name');
                const occurrenceLocation = interaction.fields.getTextInputValue('occurrence_location');
                const helpDescription = interaction.fields.getTextInputValue('help_description');
                const additionalInfo = interaction.fields.getTextInputValue('additional_info');

                try {
                    const channel = await interaction.guild.channels.create({
                        name: `ticket-${interaction.user.username}`,
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.roles.everyone.id,
                                deny: [PermissionsBitField.Flags.ViewChannel],
                            },
                            {
                                id: interaction.user.id,
                                allow: [PermissionsBitField.Flags.ViewChannel],
                            },
                            {
                                id: STAFF_ROLE_ID,
                                allow: [PermissionsBitField.Flags.ViewChannel],
                            },
                        ],
                    });

                    const ticketEmbed = new EmbedBuilder()
                        .setColor(0x0099ff)
                        .setTitle('Ticket Information')
                        .addFields(
                            { name: 'In-Game Name', value: inGameName, inline: true },
                            { name: 'Location', value: occurrenceLocation, inline: true },
                            { name: 'Issue', value: helpDescription },
                            { name: 'Additional Info', value: additionalInfo || 'None' }
                        );

                    const actionRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('close_ticket')
                                .setLabel('Close Ticket')
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId('claim_ticket')
                                .setLabel('Claim Ticket')
                                .setStyle(ButtonStyle.Primary)
                        );

                    await channel.send({ embeds: [ticketEmbed], components: [actionRow] });
                    await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
                } catch (error) {
                    console.error('Error creating ticket channel:', error);
                    await interaction.reply({ content: 'There was an error creating the ticket channel.', ephemeral: true });
                }
            } else if (interaction.customId === 'close_ticket_modal') {
                const closeReason = interaction.fields.getTextInputValue('close_reason');
                const channel = interaction.channel;

                // Get the ticket owner
                const ticketOwner = channel.name.split('-')[1]; // Assumes ticket channel name format is `ticket-username`
                const ticketOwnerUser = interaction.guild.members.cache.find(member => member.user.username === ticketOwner);

                if (!ticketOwnerUser) {
                    return await interaction.reply({ content: 'Error finding the ticket owner.', ephemeral: true });
                }

                // Fetch the entire chat
                const messages = await channel.messages.fetch({ limit: 100 });
                const messageLogs = messages.map(message => `${message.author.tag}: ${message.content}`).join('\n');

                // Send audit log
                const auditLogChannel = interaction.guild.channels.cache.get(AUDIT_LOG_CHANNEL_ID);
                if (auditLogChannel) {
                    const auditEmbed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('Ticket Closed')
                        .addFields(
                            { name: 'Ticket Channel', value: channel.name },
                            { name: 'Closed By', value: interaction.user.tag },
                            { name: 'Reason', value: closeReason },
                            { name: 'Messages', value: messageLogs }
                        );

                    await auditLogChannel.send({ embeds: [auditEmbed] });
                }

                // Send DM to the ticket owner
                const dmEmbed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Your Ticket Has Been Closed')
                    .setDescription(`Your ticket in ${interaction.guild.name} has been closed.`)
                    .addFields(
                        { name: 'Closed By', value: interaction.user.tag },
                        { name: 'Reason', value: closeReason }
                    );

                try {
                    await ticketOwnerUser.send({ embeds: [dmEmbed] });
                } catch (error) {
                    console.error('Error sending DM to the ticket owner:', error);
                }

                // Delete the ticket channel
                await channel.delete();
            }
        }

        if (interaction.type === InteractionType.MessageComponent) {
            if (interaction.customId === 'claim_ticket') {
                const member = interaction.guild.members.cache.get(interaction.user.id);

                if (!member.roles.cache.has(STAFF_ROLE_ID)) {
                    return await interaction.reply({ content: 'You do not have permission to perform this action.', ephemeral: true });
                }

                const channel = interaction.channel;

                const ticketOwner = channel.name.split('-')[1]; // Assumes ticket channel name format is `ticket-username`
                const ticketOwnerUser = interaction.guild.members.cache.find(member => member.user.username === ticketOwner);

                await channel.permissionOverwrites.set([
                    {
                        id: interaction.guild.roles.everyone.id,
                        deny: [PermissionsBitField.Flags.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [PermissionsBitField.Flags.ViewChannel],
                    },
                    {
                        id: ticketOwnerUser.id,
                        allow: [PermissionsBitField.Flags.ViewChannel],
                    }
                ]);

                const embed = channel.messages.cache.find(msg => msg.embeds.length > 0)?.embeds[0];
                if (embed) {
                    const claimedEmbed = EmbedBuilder.from(embed)
                        .setColor(0x00ff00);

                    await channel.send({ embeds: [claimedEmbed], components: [] });
                }

                await interaction.reply({ content: 'You have claimed this ticket.', ephemeral: true });
                await channel.send(`${interaction.user} has claimed this ticket.`);
            }
        }
    },
};
