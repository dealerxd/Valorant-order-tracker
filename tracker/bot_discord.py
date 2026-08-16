"""Discord botu: slash komutlari + bildirim gondericisi.

Slash komutlari kullaniliyor, boylece ayricalikli "message content" intent'ine
ihtiyac yok. DISCORD_GUILD_ID verilirse komutlar o sunucuya aninda senkronlanir;
verilmezse global sync yapilir ve yayilmasi bir saati bulabilir.
"""

from __future__ import annotations

import logging

import discord
from discord import app_commands

import commands
import henrik
from config import Config
from notify import Dispatcher
from store import Store

log = logging.getLogger(__name__)

MAX_LEN = 1900  # Discord siniri 2000, pay birakiyoruz


def _block(text: str) -> str:
    """Hizalamanin bozulmamasi icin ciktiyi kod blogunda gonderir."""
    return f"```\n{text[:MAX_LEN]}\n```"


class DiscordBot(discord.Client):
    def __init__(self, config: Config, client: henrik.HenrikClient,
                 store: Store, dispatcher: Dispatcher):
        super().__init__(intents=discord.Intents.default())
        self.config = config
        self.henrik = client
        self.store = store
        self.dispatcher = dispatcher
        self.tree = app_commands.CommandTree(self)
        self._register()

    # --- Yetki ---------------------------------------------------------------

    def _authorized(self, interaction: discord.Interaction) -> bool:
        """Admin listesi varsa ona bak; yoksa sadece operator kanalina izin ver."""
        admins = self.config.discord_admin_ids
        if admins:
            return interaction.user.id in admins
        ops = self.config.discord_ops_channel_id
        return bool(ops and interaction.channel_id == ops)

    async def _deny(self, interaction: discord.Interaction) -> None:
        log.warning(
            "Yetkisiz komut: user=%s channel=%s", interaction.user.id, interaction.channel_id
        )
        await interaction.response.send_message(
            "Bu bot yetkili kullanicilara acik.\n"
            f"Kanal ID: {interaction.channel_id} / Kullanici ID: {interaction.user.id}",
            ephemeral=True,
        )

    async def _respond(self, interaction: discord.Interaction, text: str, *, code: bool = True) -> None:
        await interaction.response.send_message(_block(text) if code else text[:MAX_LEN])

    # --- Komutlar ------------------------------------------------------------

    def _register(self) -> None:
        @self.tree.command(name="bagla", description="Paneldeki siparisi bir Valorant hesabina bagla")
        @app_commands.describe(
            kod="Siparis kodu (ilk 8 karakter, /liste ile gorursun)",
            hesap="Hesap adi, isim#tag formatinda",
        )
        async def bagla(interaction: discord.Interaction, kod: str, hesap: str) -> None:
            if not self._authorized(interaction):
                await self._deny(interaction)
                return
            # API cagrilari saniyeler surebilir, 3 sn'lik interaction limitini asmamak icin defer
            await interaction.response.defer()
            result = await commands.cmd_link(
                self.store, self.henrik, self.dispatcher, f"{kod} {hesap}"
            )
            await interaction.followup.send(_block(result))

        @self.tree.command(name="liste", description="Paneldeki aktif siparisler ve takip durumlari")
        async def liste(interaction: discord.Interaction) -> None:
            if not self._authorized(interaction):
                await self._deny(interaction)
                return
            await interaction.response.defer()
            await interaction.followup.send(_block(await commands.cmd_list(self.store)))

        @self.tree.command(name="durum", description="Siparis detayi")
        @app_commands.describe(kod="Siparis kodu")
        async def durum(interaction: discord.Interaction, kod: str) -> None:
            if not self._authorized(interaction):
                await self._deny(interaction)
                return
            await interaction.response.defer()
            await interaction.followup.send(_block(await commands.cmd_status(self.store, kod)))

        @self.tree.command(name="musteri", description="Bu kanali siparisin musteri kanali yap")
        @app_commands.describe(kod="Siparis kodu", kapat="Bildirimi kapatmak icin isaretle")
        async def musteri(interaction: discord.Interaction, kod: str, kapat: bool = False) -> None:
            if not self._authorized(interaction):
                await self._deny(interaction)
                return
            await interaction.response.defer()
            raw = f"{kod} kapat" if kapat else kod
            result = await commands.cmd_customer(
                self.store, raw, "discord", str(interaction.channel_id)
            )
            await interaction.followup.send(_block(result))

        @self.tree.command(name="duraklat", description="Takibi gecici durdur")
        @app_commands.describe(kod="Siparis kodu")
        async def duraklat(interaction: discord.Interaction, kod: str) -> None:
            if not self._authorized(interaction):
                await self._deny(interaction)
                return
            await interaction.response.defer()
            await interaction.followup.send(_block(await commands.cmd_pause(self.store, kod)))

        @self.tree.command(name="devam", description="Takibi tekrar baslat")
        @app_commands.describe(kod="Siparis kodu")
        async def devam(interaction: discord.Interaction, kod: str) -> None:
            if not self._authorized(interaction):
                await self._deny(interaction)
                return
            await interaction.response.defer()
            await interaction.followup.send(_block(await commands.cmd_resume(self.store, kod)))

        @self.tree.command(name="kaldir", description="Takibi ve mac kayitlarini sil (panele dokunmaz)")
        @app_commands.describe(kod="Siparis kodu")
        async def kaldir(interaction: discord.Interaction, kod: str) -> None:
            if not self._authorized(interaction):
                await self._deny(interaction)
                return
            await interaction.response.defer()
            await interaction.followup.send(_block(await commands.cmd_unlink(self.store, kod)))

        @self.tree.command(name="yardim", description="Komut listesi")
        async def yardim(interaction: discord.Interaction) -> None:
            if not self._authorized(interaction):
                await self._deny(interaction)
                return
            text = commands.cmd_help() + f"\n\nBu kanalin ID'si: {interaction.channel_id}"
            await self._respond(interaction, text)

    # --- Yasam dongusu -------------------------------------------------------

    async def setup_hook(self) -> None:
        if self.config.discord_guild_id:
            guild = discord.Object(id=self.config.discord_guild_id)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
            log.info("Slash komutlari %s sunucusuna senkronlandi", self.config.discord_guild_id)
        else:
            await self.tree.sync()
            log.info("Slash komutlari global senkronlandi (yayilmasi 1 saati bulabilir)")

    async def on_ready(self) -> None:
        log.info("Discord botu hazir: %s", self.user)

    # --- Dispatcher arayuzu --------------------------------------------------

    async def send(self, target: str, text: str) -> None:
        channel_id = int(target)
        channel = self.get_channel(channel_id) or await self.fetch_channel(channel_id)
        if not isinstance(channel, discord.abc.Messageable):
            raise RuntimeError(f"Kanal {channel_id} mesaj gonderilebilir degil")
        await channel.send(_block(text))
