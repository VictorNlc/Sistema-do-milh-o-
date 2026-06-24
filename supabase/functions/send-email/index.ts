import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import nodemailer from "npm:nodemailer"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { name, email, phone, city, date, time, storeType, notes } = await req.json()

    // Obter credenciais do servidor SMTP enviadas como variáveis de ambiente no Supabase
    const smtpHost = Deno.env.get('SMTP_SERVER') || 'smtp.hostinger.com'
    const smtpPort = Number(Deno.env.get('SMTP_PORT')) || 465
    const smtpUser = Deno.env.get('SMTP_USER') || 'teste@projefarma.com.br'
    const smtpPass = Deno.env.get('SMTP_PASSWORD') || 'Projefarma@@2026'

    if (!smtpUser || !smtpPass) {
      throw new Error('As credenciais SMTP_USER e SMTP_PASSWORD não estão definidas no ambiente do Supabase.')
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // SSL para a porta 465
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    // 1. Email formatado de confirmação para o Cliente
    const clientMailOptions = {
      from: `"Projefarma" <${smtpUser}>`,
      to: email,
      subject: 'Confirmação de Agendamento — Projefarma',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="background-color: #10b981; color: white; display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 50%; font-size: 24px; font-weight: bold;">P</div>
            <h2 style="color: #10b981; margin-top: 10px; margin-bottom: 5px;">Agendamento Confirmado!</h2>
            <p style="color: #64748b; margin-top: 0;">Sua consultoria de layout está agendada</p>
          </div>
          
          <p>Olá, <strong>${name}</strong>!</p>
          <p>Seu agendamento para a consultoria de layout físico da farmácia foi registrado com sucesso em nosso sistema.</p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #f1f5f9;">
            <h3 style="margin-top: 0; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Resumo dos Detalhes</h3>
            <p style="margin: 8px 0;">📅 <strong>Data:</strong> ${new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p style="margin: 8px 0;">⏰ <strong>Horário:</strong> ${time}</p>
            <p style="margin: 8px 0;">📍 <strong>Cidade:</strong> ${city}</p>
            <p style="margin: 8px 0;">🏪 <strong>Tipo de Farmácia:</strong> ${storeType}</p>
          </div>
          
          <p>Um de nossos consultores especializados da Projefarma entrará em contato em breve para alinhar os detalhes finais e enviar o link da videochamada.</p>
          
          <p style="margin-top: 30px;">Caso precise reagendar ou cancelar, entre em contato respondendo a este e-mail.</p>
          
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 35px 0 20px 0;">
          <p style="font-size: 11px; color: #94a3b8; text-align: center; line-height: 1.5;">
            Projefarma Layouts &copy; 2026<br>
            Este é um e-mail automático. Por favor, não responda a esta mensagem.
          </p>
        </div>
      `,
    }

    // 2. Email formatado de notificação para a Equipe de Vendas (Admin)
    const adminMailOptions = {
      from: `"Agendamentos Projefarma" <${smtpUser}>`,
      to: smtpUser, // Enviado para o próprio email do admin
      subject: `🚨 Novo Agendamento: ${name} (${city})`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b;">
          <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-top: 0;">Novo Agendamento Recebido!</h2>
          <p>Um cliente acabou de agendar uma reunião de consultoria no site <strong>ProjeLayout</strong>.</p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #f1f5f9;">
            <h3 style="margin-top: 0; color: #0f172a;">Dados do Cliente</h3>
            <p style="margin: 8px 0;">👤 <strong>Nome:</strong> ${name}</p>
            <p style="margin: 8px 0;">✉️ <strong>Email:</strong> ${email}</p>
            <p style="margin: 8px 0;">📞 <strong>WhatsApp/Tel:</strong> ${phone}</p>
            <p style="margin: 8px 0;">📍 <strong>Cidade/UF:</strong> ${city}</p>
          </div>

          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #f1f5f9;">
            <h3 style="margin-top: 0; color: #0f172a;">Dados do Agendamento</h3>
            <p style="margin: 8px 0;">📅 <strong>Data:</strong> ${new Date(date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
            <p style="margin: 8px 0;">⏰ <strong>Horário:</strong> ${time}</p>
            <p style="margin: 8px 0;">🏪 <strong>Tipo de Loja:</strong> ${storeType}</p>
            ${notes ? `<p style="margin: 8px 0;">📝 <strong>Observações:</strong> ${notes}</p>` : ''}
          </div>

          <p style="margin-top: 25px;">
            👉 <strong>Ação Recomendada:</strong> Acesse o Painel de Administração para atualizar o status do agendamento ou abrir o layout vinculado, se disponível.
          </p>
          
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0 20px 0;">
          <p style="font-size: 12px; color: #94a3b8;">Projefarma Layouts — Central de Vendas</p>
        </div>
      `,
    }

    // Disparar o envio assíncrono dos dois e-mails
    await Promise.all([
      transporter.sendMail(clientMailOptions),
      transporter.sendMail(adminMailOptions)
    ])

    return new Response(JSON.stringify({ success: true, message: 'E-mails enviados com sucesso!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
