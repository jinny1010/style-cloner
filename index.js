import { saveSettingsDebounced, loadExtensionSettings, extension_settings, getContext } from "../../../extensions.js";

const extensionName = "style-cloner";
const extensionFolderPath = `scripts/extensions/${extensionName}/`;

// 기본 설정값
const defaultSettings = {
    apiKey: "",
    currentStyle: "",
    isActive: true
};

let settings = defaultSettings;

// 1. 설정 로드
async function loadSettings() {
    settings = Object.assign({}, defaultSettings, extension_settings[extensionName]);
}

// 2. Gemini Vision API 호출 함수
async function analyzeImageStyle(file) {
    if (!settings.apiKey) {
        toastr.error("Google API Key가 필요합니다. 설정에서 입력해주세요.", "Style Cloner");
        return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = async function () {
        const base64String = reader.result.split(',')[1]; // 헤더 제거
        const mimeType = reader.result.split(',')[0].split(':')[1].split(';')[0];

        // UI 업데이트: 로딩 중 표시
        $('#style_cloner_analyze_btn').text('분석 중... (Gemini가 그림을 보고 있습니다)');
        $('#style_cloner_analyze_btn').prop('disabled', true);
        $('#style_cloner_preview').attr('src', reader.result).show();

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${settings.apiKey}`;
            
            const payload = {
                contents: [{
                    parts: [
                        { text: "Analyze the artistic style of this image in extreme detail for image generation prompts. Focus on: art medium (oil, digital, pencil, etc.), line quality (thick, thin, sketchy), coloring style (vibrant, muted, watercolor), lighting, and texture. Do NOT describe the characters or content. Output ONLY the style description keywords separated by commas." },
                        { inline_data: { mime_type: mimeType, data: base64String } }
                    ]
                }]
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message);
            }

            const styleDescription = data.candidates[0].content.parts[0].text;
            
            // 결과 저장 및 UI 반영
            settings.currentStyle = styleDescription;
            extension_settings[extensionName] = settings;
            saveSettingsDebounced();
            
            $('#style_cloner_result').val(styleDescription);
            toastr.success("스타일 분석 완료! 프롬프트가 추출되었습니다.", "Style Cloner");

            // 전역 변수로 노출 (다른 확장이 쓸 수 있게)
            window.style_cloner_prompt = styleDescription;

        } catch (error) {
            console.error(error);
            toastr.error("분석 실패: " + error.message, "Style Cloner");
        } finally {
            $('#style_cloner_analyze_btn').text('이미지 스타일 추출하기');
            $('#style_cloner_analyze_btn').prop('disabled', false);
        }
    };
}

// 3. 설정창 UI 생성
function createSettingsUI() {
    const html = `
    <div class="style-cloner-container">
        <h3>🎨 Style Cloner (Gemini Vision)</h3>
        
        <div class="style-cloner-input-group">
            <label>Google API Key (AI Studio)</label>
            <input type="password" id="style_cloner_apikey" class="text_pole" placeholder="AI Studio 키를 입력하세요" value="${settings.apiKey || ''}" />
        </div>

        <div class="style-cloner-input-group">
            <label>스타일 참조 이미지 업로드</label>
            <input type="file" id="style_cloner_file" accept="image/*" />
            <img id="style_cloner_preview" class="style-cloner-preview" />
            <button id="style_cloner_analyze_btn" class="menu_button">이미지 스타일 추출하기</button>
        </div>

        <div class="style-cloner-input-group">
            <label>추출된 스타일 프롬프트 (자동 저장됨)</label>
            <textarea id="style_cloner_result" class="style-cloner-textarea" readonly>${settings.currentStyle || ''}</textarea>
            <small>※ 이 내용은 전역변수 window.style_cloner_prompt 에도 저장됩니다.</small>
        </div>
    </div>
    `;
    
    return html;
}

// 4. 이벤트 리스너 등록
function addEventListeners() {
    // API 키 변경 시 저장
    $(document).on('input', '#style_cloner_apikey', function () {
        settings.apiKey = $(this).val();
        extension_settings[extensionName] = settings;
        saveSettingsDebounced();
    });

    // 분석 버튼 클릭 시
    $(document).on('click', '#style_cloner_analyze_btn', function () {
        const fileInput = document.getElementById('style_cloner_file');
        if (fileInput.files.length > 0) {
            analyzeImageStyle(fileInput.files[0]);
        } else {
            toastr.warning("이미지를 먼저 선택해주세요.", "Style Cloner");
        }
    });
}

// 5. 초기화
jQuery(async () => {
    await loadSettings();
    
    // 설정창에 메뉴 추가
    const settingsHtml = createSettingsUI();
    $('#extensions_settings').append(settingsHtml); // 확장 설정 탭에 붙이기 (위치는 ST 버전에 따라 다를 수 있음)
    
    addEventListeners();
    
    // 초기 로드시 전역변수 세팅
    if (settings.currentStyle) {
        window.style_cloner_prompt = settings.currentStyle;
    }
    
    console.log(`${extensionName} loaded.`);
});
