# 4. 세 제작 세션에 공통으로 전달할 제작 명세

현재 작업 폴더가 유일한 작업 영역이다.

parent 또는 sibling 디렉터리를 열지 않는다.

다른 run, 다른 prompt, 다른 결과, 다른 screenshot을 참고하지 않는다.

이전 conversation을 복원하지 않는다.

---

# [최종 목표]

Three.js를 사용하여 **완전히 코드로 생성된 3D 서브컬쳐 미소녀 게임 캐릭터**를 제작한다.

캐릭터는 다음 요소를 실제 3D geometry와 scene hierarchy로 갖는다.

- 얼굴
- 눈
- 머리카락
- twin-tail
- 몸
- 팔
- 손
- 다리
- 의상
- skirt
- scarf
- boots
- ribbon
- rapier
- magic effects

단순한 mannequin, blockout, primitive demo, placeholder, 기술 데모로 끝내지 않는다.

기본 geometry로 시작하는 것은 허용하지만 최종 결과가 단순히 sphere와 box 몇 개를 붙여 놓은 프로토타입처럼 보여서는 안 된다.

---

# [중요: 외부 3D Asset 금지]

캐릭터를 Three.js 안에서 직접 생성한다.

금지:

- GLB
- GLTF
- FBX
- OBJ
- VRM
- Mixamo
- VRoid
- Sketchfab
- Ready Player Me
- Character Creator
- Unity Asset Store
- Unreal Marketplace
- 외부 character mesh
- 외부 animation
- 외부 texture
- sprite character
- billboard character

즉 이 벤치마크는 외부 모델을 Three.js에서 보여주는 테스트가 아니다.

**Three.js 코드 자체가 캐릭터를 구축해야 한다.**

허용:

- Three.js built-in geometry
- BufferGeometry
- 직접 계산한 vertices
- Curve
- TubeGeometry
- ExtrudeGeometry
- LatheGeometry
- SphereGeometry
- Capsule 계열 직접 구현
- CylinderGeometry
- PlaneGeometry
- custom shader
- MeshToonMaterial
- MeshStandardMaterial
- CanvasTexture
- DataTexture
- procedural texture
- procedural geometry

외부 이미지를 texture로 사용하지 않는다.

---

# [캐릭터 디자인: 미소녀 판타지 마법검사]

캐릭터는 생동감 있고 귀여운 **서브컬쳐 미소녀 판타지 마법검사 모험가**다.

## 얼굴

다음을 명확히 표현한다.

- 부드러운 anime 얼굴형
- 큰 눈
- amber / ruby 계열 iris
- pupil
- 눈 내부 highlight
- 진한 upper eyelash
- 작은 코
- 작은 입
- 귀엽고 자신감 있는 표정

3/4 카메라에서 얼굴 방향이 분명해야 한다.

평평한 얼굴 표면에 눈 texture 두 장만 붙인 것처럼 보이지 않게 한다.

다음의 실제 입체 관계가 읽혀야 한다.

- 이마
- 눈
- 볼
- 코
- 턱
- 얼굴 측면

---

## 머리카락

밝은 silver hair.

구조:

- bangs
- side hair
- back hair
- 풍성한 twin-tail
- crown highlight

머리카락은 noodle 형태의 가느다란 선 여러 개보다 큰 anime hair mass를 우선한다.

큰 덩어리와 일부 세부 strand를 결합한다.

Twin-tail은 몸 동작보다 약간 늦게 움직이는 secondary motion을 가진다.

---

## 의상

- dark navy 제복풍 coat
- pink ribbon
- frill이 포함된 pleated skirt
- 긴 scarf
- dark leather long boots
- fingerless gloves

다음 소재가 서로 구별되어야 한다.

- 피부
- 머리카락
- 천
- 가죽
- 금속
- 마력

장식을 과도하게 추가하여 silhouette를 망치지 않는다.

---

## 무기

한손용 마법 레이피어.

구성:

- grip
- guard
- blade
- magical accent

검은 반드시 손의 grip에서 자연스럽게 이어져야 한다.

손에서 떠 있어서는 안 된다.

Attack animation 동안에도 손과 검의 연결 관계를 유지한다.

---

## 마법 이펙트

주요 색:

- cyan
- pink

Three.js geometry/material을 사용한다.

가능한 표현:

- transparent arc mesh
- additive material
- ring
- torus
- cone
- beam
- custom BufferGeometry
- particles
- shader effect

외부 PNG 이펙트 이미지를 사용하지 않는다.

Attack A:

- 검의 cyan/pink slash trail

Attack B:

- charge
- sword-tip glow
- forward magical wave

Attack B의 마력은 검 끝 또는 검 진행 방향에서 발생해야 한다.

---

# [3D Anime Art Direction]

목표 스타일:

**Polished Modern Anime Indie 3D Game Character**

photoreal 인간을 목표로 하지 않는다.

---

## 1. Anime 얼굴 우선

얼굴은 캐릭터의 가장 중요한 품질 기준이다.

눈에는 최소 다음이 구별되어야 한다.

- sclera
- iris
- pupil
- highlight
- eyelash

멀리서도 미소녀 캐릭터임이 읽혀야 한다.

---

## 2. Cel / Toon Shading

Three.js의 toon 기반 렌더링을 적극 사용한다.

권장:

`MeshToonMaterial`

또는 이에 준하는 직접 구현 toon shader.

목표:

- 밝고 선명한 base color
- 명확한 light/shadow separation
- 2~3단계 정도의 anime shading
- 과도한 realistic specular 억제
- 밝은 얼굴
- 선명한 hair highlight
- navy 의상의 형태가 암부에 묻히지 않음

금지:

- photoreal skin
- noisy PBR
- 칙칙한 realistic lighting
- 과도한 bloom
- 세부를 가리는 과도한 darkness

---

## 3. Outline

anime outline을 구현할 수 있다.

권장 방법:

캐릭터 mesh를 복제하여

- BackSide
- 약간 확대
- dark navy / purple material

을 사용하는 inverted hull 방식.

단, outline이 캐릭터의 실제 구조 문제를 숨기는 수단이 되어서는 안 된다.

pure black outline보다 색감 있는 dark outline을 선호한다.

---

## 4. 실제 3D 실루엣

다음을 단순 texture 표현으로 처리하지 않는다.

- twin-tail
- skirt
- scarf
- coat hem
- ribbon
- boots
- rapier

실제로 silhouette를 만드는 geometry를 사용한다.

---

# [캐릭터 Rig Hierarchy]

Three.js 안에서 명확한 캐릭터 계층 구조를 만든다.

반드시 다음에 해당하는 semantic node를 갖는다.

```text
characterRoot
└─ hips
   ├─ torso
   │  ├─ chest
   │  │  ├─ neck
   │  │  │  └─ head
   │  │  ├─ shoulderL
   │  │  │  └─ armL
   │  │  │     └─ forearmL
   │  │  │        └─ handL
   │  │  └─ shoulderR
   │  │     └─ armR
   │  │        └─ forearmR
   │  │           └─ handR
   ├─ thighL
   │  └─ shinL
   │     └─ footL
   └─ thighR
      └─ shinR
         └─ footR
```

추가 hierarchy:

```text
head
├─ twinTailL
└─ twinTailR

chest
└─ scarf

hips
└─ skirt

weaponHand
└─ rapier
```

각 node는 실제 관절 pivot에서 회전해야 한다.

팔 중앙이나 몸 중앙을 축으로 억지로 회전시키지 않는다.

---

# [SkinnedMesh 여부]

Three.js `SkinnedMesh`를 사용할 수 있으며 잘 구현할 수 있다면 권장한다.

그러나 이 벤치마크에서 GLB export나 범용 humanoid skeleton 호환성은 요구하지 않는다.

고품질 결과를 더 안정적으로 만들 수 있다면:

- semantic Object3D hierarchy
- segmented meshes
- parent-child articulated rig

방식을 사용해도 된다.

중요한 것은 실제 렌더에서 다음이 자연스럽게 움직이는 것이다.

- shoulder
- elbow
- wrist
- hips
- knee
- ankle
- neck

---

# [Animation 시스템]

애니메이션은 가능하면 Three.js `AnimationMixer`와 `AnimationClip`으로 구현한다.

정확히 다음 네 clip 이름을 제공한다.

```text
Idle
Run
Attack_A
Attack_B
```

각 clip은 실제 keyframe animation이어야 한다.

단순 CSS transform이나 화면 전체 이동을 animation으로 간주하지 않는다.

캐릭터의 관절 node가 움직여야 한다.

---

# [Idle]

길이:

약 `2.0초 loop`

포함:

- 미세한 호흡
- 작은 중심 이동
- blink
- twin-tail secondary motion
- skirt secondary motion
- scarf secondary motion

loop 시작과 끝에서 튀지 않는다.

---

# [Run]

길이:

약 `0.65~0.75초 loop`

in-place animation으로 만든다.

다음이 모두 읽혀야 한다.

- left foot contact
- right foot contact
- passing pose
- up pose
- hip vertical motion
- shoulder counter rotation
- 팔/다리 교대
- twin-tail delay
- skirt delay
- scarf trailing

발이 지면을 딛는 순간 발의 위치가 심하게 미끄러져 보이지 않아야 한다.

전체 `characterRoot`를 앞뒤로 흔드는 것만으로 달리기를 표현하지 않는다.

---

# [Attack A]

길이:

약 `0.75~0.9초`

일회성 공격.

날렵한 검 베기 또는 찌르기.

구조:

1. anticipation
2. weight shift
3. wind-up
4. strike
5. follow-through
6. recovery

검을 든 팔만 움직이지 않는다.

다음이 함께 움직여야 한다.

- chest
- spine/torso
- hips
- shoulder
- supporting leg
- sword arm

타격 순간 cyan/pink 검 궤적을 발생시킨다.

---

# [Attack B]

길이:

약 `1.0~1.2초`

일회성 마법검 공격.

구조:

1. anticipation
2. sword raise
3. casting
4. charge
5. release
6. energy wave
7. recovery

마력은 검 끝에서 시작한다.

캐릭터와 관계없는 world position에서 갑자기 생기면 안 된다.

---

# [Secondary Motion]

다음 요소는 몸과 정확히 동시에 움직이지 않는다.

- twin-tail
- scarf
- skirt
- coat hem

원칙:

- 몸이 먼저 움직임
- secondary part가 약간 늦게 따라옴
- 방향 전환 시 작은 overshoot
- 멈출 때 settling

물리 engine은 필요하지 않다.

AnimationClip keyframe만으로 구현해도 된다.

결과 안정성을 우선한다.

---

# [Blink]

Idle에 실제 blink를 구현한다.

가능한 방법:

- eyelid mesh rotation
- eyelid scale
- eye cover geometry
- morph target
- upper eyelash movement

눈 전체 object를 단순히 사라지게 만드는 방식보다 자연스러운 eyelid animation을 선호한다.

---

# [Three.js Renderer]

`WebGLRenderer`를 사용한다.

권장 기본:

```text
antialias = true
alpha = false
```

pixel-art 스타일을 흉내 내기 위한 low-resolution render나 nearest-neighbor 확대를 하지 않는다.

devicePixelRatio는 지나친 GPU 낭비를 막는 선에서 제한할 수 있다.

예:

```js
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

---

# [공통 Camera]

PerspectiveCamera를 사용한다.

권장:

- FOV: 약 30~40도
- 극단적인 wide angle 금지

세 variant에서 동일한 camera 설정을 사용한다.

메인 카메라는 약한 오른쪽 3/4 시점이다.

캐릭터 전체가 화면에 들어오도록 한다.

세 캐릭터의 실제 world-space 높이가 동일하므로 variant별로 임의 zoom을 변경하지 않는다.

---

# [공통 Lighting]

모든 variant는 같은 lighting 구조를 사용한다.

예:

- HemisphereLight
- main DirectionalLight
- 약한 fill DirectionalLight

목표:

- 얼굴 밝음
- silver hair 형태 분리
- navy outfit 가독성
- sword 가독성
- cyan/pink effect 과노출 방지

dramatic darkness보다 캐릭터 비교에 적합한 neutral studio lighting을 우선한다.

---

# [Ground]

캐릭터 발 접촉을 확인할 수 있도록 간단한 ground plane을 둔다.

과도한 환경이나 배경 모델을 만들지 않는다.

ground는 캐릭터 비교의 보조 수단이다.

---

# [웹 페이지]

각 제작 세션은 자기 폴더에 최소 다음을 만든다.

```text
index.html
app.js
style.css
metadata.json
vendor/
  three.module.js
screenshots/
```

필요하면 추가 JavaScript module을 분리해도 된다.

예:

```text
src/
  character.js
  rig.js
  materials.js
  animations.js
  effects.js
  ui.js
```

코드를 적절히 모듈화하는 것을 권장한다.

단, 지나친 framework 구조로 작업 시간을 낭비하지 않는다.

React, Vue, Babylon.js 등은 사용하지 않는다.

핵심 렌더러는 Three.js다.

---

# [런타임 외부 요청 금지]

최종 페이지를 로컬 HTTP 서버에서 열었을 때 다음 외부 요청이 없어야 한다.

- CDN
- Google Fonts
- image host
- API
- asset server
- analytics

Three.js도 로컬 파일에서 로드한다.

---

# [페이지 UI]

페이지에는 다음 영역을 제공한다.

## Main 3D Preview

사용자가 캐릭터를 큰 화면에서 볼 수 있다.

## Animation buttons

- Idle
- Run
- Attack A
- Attack B

클릭하면 해당 animation을 재생한다.

Run과 Idle은 loop.

Attack A/B는 one-shot 후 Idle로 자연스럽게 돌아간다.

## Auto Play

다음을 순차적으로 볼 수 있는 기능을 둘 수 있다.

```text
Idle
→ Run
→ Attack A
→ Attack B
```

## View buttons

- Front
- 3/4
- Side
- Back

각 variant에서 동일한 camera preset을 사용한다.

## Turntable

캐릭터를 천천히 360도 회전하여 전신을 확인할 수 있는 모드.

## Contact Sheet

페이지 아래에서 key pose를 정적인 thumbnail/grid 형태로 보여준다.

---

# [Contact Sheet 포즈]

## Idle

최소 4개:

- start
- breathing
- blink/secondary pose
- loop end

## Run

최소 6개:

1. left contact
2. left passing
3. left up
4. right contact
5. right passing
6. right up

## Attack A

최소 6개:

1. neutral
2. anticipation
3. wind-up
4. strike
5. follow-through
6. recovery

## Attack B

최소 6개:

1. neutral
2. casting start
3. charge
4. release
5. wave
6. recovery

각 contact thumbnail은 동일한 camera framing을 사용한다.

---

# [자동 검증용 DOM 계약]

controller가 headless browser에서 독립적으로 확인할 수 있도록 다음 ID를 제공한다.

```text
three-canvas
animation-controls
view-controls
contact-sheet
metadata-panel
```

각 animation button에는:

```text
data-animation="Idle"
data-animation="Run"
data-animation="Attack_A"
data-animation="Attack_B"
```

contact pose에는 다음과 같은 attribute를 둔다.

```text
data-contact-animation="Run"
data-contact-index="0"
```

---

# [자동 검증용 JavaScript API]

페이지 준비 완료 후 다음 객체를 제공한다.

```js
window.__CHARACTER_BENCH__
```

최소 다음 정보를 노출한다.

```js
{
  ready: true,
  variant: "...",
  threeVersion: "...",
  targetBodyRatio: "...",
  measuredHeight: 0,
  triangleCount: 0,
  meshCount: 0,
  materialCount: 0,
  nodeCount: 0,
  animations: [
    "Idle",
    "Run",
    "Attack_A",
    "Attack_B"
  ]
}
```

그리고 최소 다음 함수를 제공한다.

```js
setAnimation(name)
setAnimationTime(name, normalizedTime)
setView(name)
resetView()
```

`setAnimationTime()`은 controller가 특정 contact pose를 재현할 수 있도록 한다.

normalizedTime 범위:

```text
0.0 ~ 1.0
```

---

# [실제 측정값]

triangle count 등은 하드코딩하지 않는다.

Three.js scene graph와 geometry를 실제 순회하여 계산한다.

indexed geometry:

```text
index.count / 3
```

non-indexed geometry:

```text
position.count / 3
```

캐릭터 높이는 `Box3`를 통해 runtime에서 측정한다.

animation 이름은 실제 AnimationClip 배열에서 얻는다.

---

# [metadata.json]

최소 다음을 기록한다.

```text
variant
targetBodyRatio
threeVersion
measuredHeight
triangleCount
meshCount
materialCount
nodeCount
animationNames
animationDurations
```

그러나 controller는 `metadata.json` 값을 그대로 믿지 않는다.

페이지 runtime과 scene graph를 다시 검사한다.

---

# [품질 기준]

캐릭터는 단순한 primitive mannequin으로 보이지 않아야 한다.

특히 다음을 시각적으로 확인한다.

## 얼굴

- anime 미소녀 얼굴
- 큰 눈
- iris
- pupil
- highlight
- eyelash
- 부드러운 턱선

## 머리

- silver hair
- bangs
- twin-tail
- hair mass
- highlight

## 의상

- navy coat
- pink ribbon
- pleated skirt
- scarf
- long boots
- gloves

## 전투

- 손과 sword 연결
- sword silhouette
- slash effect
- magic wave

## Animation

- 몸 전체가 동작에 참여
- 관절 연결이 끊기지 않음
- Run이 실제 달리기로 읽힘
- 두 공격이 서로 확실히 다름

---

# [금지되는 저품질 결과]

다음을 완성으로 취급하지 않는다.

- sphere 하나를 머리로 사용하고 얼굴이 없음
- capsule 몇 개만 붙인 mannequin
- 머리카락이 단순 두 개의 원기둥
- skirt가 단순 cylinder 하나
- 손이 없음
- 검이 손에서 떨어져 있음
- 눈이 단순 검은 점
- Run이 root bounce뿐임
- Attack이 팔 하나의 회전뿐임
- Attack A와 B가 이펙트 색만 다름
- S/M/L이 object scale만 다름
- billboard/sprite를 3D처럼 배치
- 외부 모델을 로드하여 결과를 대체

---

# [제작 순서]

권장:

1. proportion 정의
2. rig hierarchy 생성
3. torso / pelvis
4. legs
5. arms / hands
6. head
7. anime face
8. hair
9. twin-tail
10. clothing
11. skirt / coat
12. scarf / ribbon
13. boots / gloves
14. sword
15. toon material
16. outline
17. Idle
18. Run
19. Attack A
20. Attack B
21. secondary motion
22. magic effects
23. camera / lighting
24. contact sheet
25. controller API
26. browser 검증
27. 집중 수정

장식보다 먼저 silhouette와 body proportion을 완성한다.

---

# [자체 검증]

첫 완성본 후 실제 로컬 HTTP 서버로 페이지를 연다.

`file://`로만 확인하지 않는다.

실제 Chromium 계열 브라우저에서 확인한다.

---

## 기술 검증

확인:

- HTTP 200
- JavaScript exception 없음
- WebGL context 정상
- 외부 request 없음
- Three.js 정확한 version
- character scene 존재
- mesh 존재
- material 존재
- 4 animation clip 존재
- clip 이름 정확
- `window.__CHARACTER_BENCH__.ready === true`
- 캐릭터 높이 약 1.60
- triangle count 정상
- UI controls 작동
- resize 작동

---

## 시각 검증

3/4 camera에서 자세히 확인한다.

- 미소녀 얼굴
- 눈 highlight
- silver twin-tail
- 목과 어깨 연결
- hand
- ribbon
- coat
- skirt
- scarf
- boots
- sword
- toon shading
- outline

---

## Run 검증

실제 animation을 반복 재생한다.

확인:

- foot contact
- weight shift
- 골반 움직임
- shoulder counter rotation
- arm swing
- 다리 교대
- twin-tail lag
- skirt lag
- scarf lag
- foot sliding

---

## Attack A 검증

- anticipation
- body rotation
- weight shift
- strike
- sword trail
- follow-through
- recovery

---

## Attack B 검증

- casting
- sword raise
- charge
- sword-tip origin
- wave release
- recovery

구조 검사를 통과했더라도 시각적으로 어색하면 완료로 판단하지 않는다.

---

# [집중 수정]

첫 완성본 후 명백한 문제는 최대 두 차례 집중 수정한다.

수정 우선순위:

1. 얼굴
2. silhouette
3. body proportion
4. 관절 연결
5. Run
6. Attack A
7. Attack B
8. secondary motion
9. material
10. 작은 장식

장식 문제보다 얼굴이나 animation 문제를 먼저 해결한다.

두 번 수정 후에도 한계가 남으면 숨기지 말고 보고한다.

---

---

# Controller-confirmed environment

Use exactly Three.js "0.186.1" (the version confirmed before session launch). Do not substitute another version or use a floating dependency. In this release, vendor/three.module.js imports ./three.core.js; vendor both files from the exact npm package and retain its LICENSE file.


## L 세션에만 전달

캐릭터는 **약 4.5~5.5등신의 스타일리시 Anime 미소녀**다.

전체 world-space 높이는 약 `1.60`으로 유지한다.

특징:

- 상대적으로 작은 머리
- 긴 팔과 다리
- 날렵한 silhouette
- 넓은 검술 arc
- 자연스러운 torso/hip rotation
- 길어진 다리에서 발생하는 명확한 Run 동작

단, 현실적인 7~8등신 인간 모델로 만들지 않는다.

anime 미소녀 특유의

- 큰 눈
- 작은 코
- 부드러운 얼굴형
- stylized proportion

을 유지한다.

---
