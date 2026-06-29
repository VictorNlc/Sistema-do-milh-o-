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
    const body = await req.json()
    const { 
      action, name, email, phone, city, date, time, storeType, notes, 
      layoutName, storeWidth, storeHeight, shareUrl, items, totalBudget,
      layoutImage 
    } = body

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

    // ─── ACTION: SEND PROPOSAL ─────────────────────────────────────────────
    if (action === 'send-proposal') {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Nome inválido.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
      if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
        return new Response(JSON.stringify({ success: false, error: 'E-mail inválido.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Telefone inválido.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      // Monta as linhas da tabela com os mobiliários do orçamento
      let itemsTableRows = ''
      if (items && Array.isArray(items)) {
        itemsTableRows = items.map(item => `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-size: 13px; color: #334155;">${item.name}</td>
            <td style="padding: 10px; font-size: 13px; text-align: center; color: #334155;">${item.quantity}</td>
            <td style="padding: 10px; font-size: 13px; text-align: right; color: #334155;">R$ ${Number(item.price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding: 10px; font-size: 13px; text-align: right; font-weight: 600; color: #0f172a;">R$ ${Number(item.total).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `).join('')
      } else {
        itemsTableRows = `
          <tr>
            <td colspan="4" style="padding: 15px; text-align: center; color: #94a3b8; font-size: 13px;">Nenhum mobiliário inserido neste layout.</td>
          </tr>
        `
      }

      const totalVal = Number(totalBudget) || 0
      const sizeW = Number(storeWidth) || 0
      const sizeH = Number(storeHeight) || 0

      // Se houver imagem do layout, exibe no corpo do e-mail
      let imageHtml = ''
      const attachments = []
      
      if (layoutImage && typeof layoutImage === 'string' && layoutImage.startsWith('data:image')) {
        imageHtml = `
          <div style="text-align: center; margin: 25px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; padding: 6px; background-color: #f8fafc; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
            <img src="cid:layout-image" alt="Imagem do Layout" style="max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 0 auto;" />
          </div>
        `
        const base64Data = layoutImage.split(';base64,').pop()
        if (base64Data) {
          attachments.push({
            filename: 'layout.jpg',
            content: base64Data,
            encoding: 'base64',
            cid: 'layout-image'
          })
        }
      }

      // E-mail HTML para o Cliente
      const clientMailOptions = {
        from: `"Projefarma" <${smtpUser}>`,
        to: email,
        subject: `Seu Projeto e Orçamento do ProjeLayout estão prontos! — ${layoutName || 'Minha Farmácia'}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; color: #1e293b; line-height: 1.6; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 25px; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px;">
              <div style="background-color: #10b981; color: white; display: inline-flex; width: 50px; height: 50px; align-items: center; justify-content: center; border-radius: 12px; font-size: 26px; font-weight: 800; margin-bottom: 10px; box-shadow: 0 4px 10px rgba(16,185,129,0.15)">P</div>
              <h2 style="color: #0f172a; margin: 10px 0 5px 0; font-size: 22px; font-weight: 800;">Seu Planejamento Está Pronto!</h2>
              <p style="color: #64748b; margin: 0; font-size: 14px;">Obrigado por planejar o layout de sua farmácia conosco.</p>
            </div>
            
            <p style="font-size: 15px;">Olá, <strong>${name}</strong>!</p>
            <p style="font-size: 15px;">Nossa equipe especializada planejou cada detalhe do layout de sua farmácia para torná-lo moderno, funcional e extremamente atrativo ao público.</p>
            
            ${imageHtml}

            <div style="background-color: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0; border: 1px solid #e2e8f0;">
              <h3 style="margin-top: 0; color: #0f172a; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Resumo do Layout</h3>
              <p style="margin: 8px 0; font-size: 14px;">🏪 <strong>Nome do Projeto:</strong> ${layoutName || 'Farmácia Premium'}</p>
              <p style="margin: 8px 0; font-size: 14px;">📐 <strong>Área Total:</strong> ${sizeW}m × ${sizeH}m (${(sizeW * sizeH).toFixed(0)}m²)</p>
              <p style="margin: 8px 0; font-size: 14px;">🔗 <strong>Link do Projeto:</strong> <a href="${shareUrl}" style="color: #2563eb; font-weight: bold; text-decoration: underline;" target="_blank">Abrir visualizador interativo em 3D</a></p>
            </div>

            <h3 style="color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 6px; margin-top: 30px; font-size: 16px;">Orçamento Detalhado de Mobiliários</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <thead>
                <tr style="background-color: #f8fafc; text-align: left;">
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #475569;">Gôndola / Móvel</th>
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #475569; text-align: center;">Qtd</th>
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #475569; text-align: right;">Preço Unit.</th>
                  <th style="padding: 10px; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #475569; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsTableRows}
              </tbody>
              <tfoot>
                <tr style="font-weight: bold; background-color: #f8fafc;">
                  <td colspan="3" style="padding: 12px 10px; border-top: 2px solid #cbd5e1; text-align: right; font-size: 14px;">Valor Total Estimado:</td>
                  <td style="padding: 12px 10px; border-top: 2px solid #cbd5e1; text-align: right; color: #10b981; font-size: 18px; font-weight: 800;">R$ ${totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>

            <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 20px; text-align: center; margin: 30px 0 20px 0;">
              <p style="margin-top: 0; margin-bottom: 12px; font-size: 14px; color: #065f46; font-weight: 600;">Gostaria de negociar condições comerciais ou alterar os móveis do projeto?</p>
              <a href="https://wa.me/5551996390506?text=Ol%C3%A1!%20Gostaria%20de%20conversar%20sobre%20o%20projeto%20de%20farm%C3%A1cia%20que%20criei%20no%20ProjeLayout%20(${encodeURIComponent(layoutName || 'Farmácia')})" 
                 style="background-color: #25d366; color: white; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 10px rgba(37,211,102,0.2); font-size: 15px;"
                 target="_blank"
              >
                💬 Falar direto no WhatsApp
              </a>
            </div>
            
            <p style="font-size: 15px; margin-top: 25px;">Qualquer dúvida, estamos à inteira disposição para ajustar o seu layout e fabricar a drogaria de seus sonhos!</p>
            
            <p style="margin-top: 30px; margin-bottom: 0;">Com carinho,<br><strong>Equipe de Vendas Projefarma</strong></p>
            
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 35px 0 20px 0;">
            <p style="font-size: 11px; color: #94a3b8; text-align: center; line-height: 1.5; margin: 0;">
              Projefarma Layouts &copy; 2026<br>
              Este é um e-mail automático enviado pelo ProjeLayout. Por favor, não responda a esta mensagem.
            </p>
          </div>
        `,
        attachments: attachments
      }

      // E-mail de Notificação para a Equipe Interna (Admin)
      const adminMailOptions = {
        from: `"Propostas ProjeLayout" <${smtpUser}>`,
        to: smtpUser,
        subject: `🚨 Proposta Solicitada por E-mail: ${name} (${layoutName || 'Sem nome'})`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b; background-color: #f8fafc;">
            <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-top: 0; font-size: 18px;">Nova Solicitação de Proposta Comercial!</h2>
            <p>Um cliente acabou de solicitar a proposta e orçamento detalhado por e-mail no site.</p>
            
            <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; margin: 15px 0; border: 1px solid #e2e8f0;">
              <h3 style="margin-top: 0; color: #0f172a; font-size: 14px;">Dados do Cliente</h3>
              <p style="margin: 6px 0; font-size: 13px;">👤 <strong>Nome:</strong> ${name}</p>
              <p style="margin: 6px 0; font-size: 13px;">✉️ <strong>Email:</strong> ${email}</p>
              <p style="margin: 6px 0; font-size: 13px;">📞 <strong>WhatsApp/Tel:</strong> ${phone}</p>
            </div>

            <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; margin: 15px 0; border: 1px solid #e2e8f0;">
              <h3 style="margin-top: 0; color: #0f172a; font-size: 14px;">Dados do Projeto</h3>
              <p style="margin: 6px 0; font-size: 13px;">🏪 <strong>Nome do Projeto:</strong> ${layoutName || 'Meu Layout'}</p>
              <p style="margin: 6px 0; font-size: 13px;">📐 <strong>Área:</strong> ${sizeW}m × ${sizeH}m (${(sizeW * sizeH).toFixed(0)}m²)</p>
              <p style="margin: 6px 0; font-size: 13px;">💰 <strong>Valor do Orçamento:</strong> R$ ${totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p style="margin: 6px 0; font-size: 13px;">🔗 <strong>Link do Layout:</strong> <a href="${shareUrl}" style="color: #2563eb; font-weight: bold;" target="_blank">Abrir visualizador interativo</a></p>
            </div>

            <p style="margin-top: 20px; font-size: 13px; color: #475569;">
              👉 <strong>Ação Recomendada:</strong> Entre em contato com o cliente no WhatsApp para fechar a venda dos mobiliários!
            </p>
          </div>
        `,
        attachments: attachments
      }

      await Promise.all([
        transporter.sendMail(clientMailOptions),
        transporter.sendMail(adminMailOptions)
      ])

      return new Response(JSON.stringify({ success: true, message: 'Proposta enviada por e-mail com sucesso!' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // ─── ACTION: DEFAULT (APPOINTMENT REGISTRATION) ──────────────────────
    // Keep original code compatibility
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      return new Response(JSON.stringify({ success: false, error: 'Nome inválido ou muito longo.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
    if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
      return new Response(JSON.stringify({ success: false, error: 'E-mail inválido.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (!phone || typeof phone !== 'string' || phone.trim().length === 0 || phone.length > 30) {
      return new Response(JSON.stringify({ success: false, error: 'Telefone inválido.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (!city || typeof city !== 'string' || city.trim().length === 0 || city.length > 100) {
      return new Response(JSON.stringify({ success: false, error: 'Cidade inválida.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!date || typeof date !== 'string' || !dateRegex.test(date) || isNaN(Date.parse(date))) {
      return new Response(JSON.stringify({ success: false, error: 'Data inválida. Use o formato AAAA-MM-DD.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/
    if (!time || typeof time !== 'string' || !timeRegex.test(time)) {
      return new Response(JSON.stringify({ success: false, error: 'Horário inválido. Use o formato HH:MM.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const validStoreTypes = ['Popular', 'Premium', 'Manipulação', 'Completa', 'Outro']
    if (!storeType || typeof storeType !== 'string' || !validStoreTypes.includes(storeType)) {
      return new Response(JSON.stringify({ success: false, error: 'Tipo de loja inválido.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

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
