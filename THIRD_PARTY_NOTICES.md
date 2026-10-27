# Resource provenance

This kit assembles original workspace workflows, design guidance, templates, and
card implementations for students. New pipeline resources exclude private source recordings and private reference
screenshots. The original kit's previously published example media and
brand assets remain unchanged; their inclusion does not grant third-party rights.

- HyperFrames: https://github.com/heygen-com/hyperframes (Apache-2.0).
  The hyperframes, hyperframes-cli, hyperframes-registry, and gsap skill packages
  were bundled with the original workspace from the HyperFrames skill ecosystem.
  The upstream Apache license is included in licenses/HYPERFRAMES-LICENSE.
- GSAP is installed from npm; its own license applies. See the license files in
  node_modules/gsap and https://gsap.com/community/standard-license/.
- Some library styles reference Google Fonts. Font licenses remain with their
  publishers. Install and preserve applicable licenses when localizing fonts.
- Vox, Kallaway, and Infinite are aesthetic reference names. These templates are
  not official brand assets or endorsed by those creators or organizations.

No blanket relicensing of third-party components is implied. See LICENSE for the
MIT permission for the original kit material. Imported pipeline resources
retain the grant in licenses/PIPELINE-USE-PERMISSION.txt. This includes the added
pipeline skills, style library, templates, shared editing tools, and new short-form
workflow. Third-party notices override these grants for their respective assets.

Library names, handles, statistics, and source labels inside cards are illustrative
placeholders. Replace them with your own verified copy before publishing a video.

The three videos in examples/showcase were also explicitly supplied by Nate for
public inclusion as finished-output references. They retain their existing asset
rights; inclusion does not grant rights to third-party brands or embedded media.

## Community skills included in v2.0

These skills are published by their authors under open-source licenses. Each folder keeps its own `LICENSE`
(and `NOTICE` where there is one); that license, not this repo's, applies to the folder, including its media.

| Skill | Author | License |
| --- | --- | --- |
| `add-zooms` | Louise de Sadeleer | MIT |
| `business-motion-film` | echris6 | MIT |
| `collage` | Prakhar Mehta | MIT |
| `editing-videos` | kmilo93sd | MIT (see its graphics and library LICENSES.md for bundled media) |
| `ghost-editor` | kurbaitaev | MIT (see docs/THIRD_PARTY for audio and fonts) |
| `lower-thirds` | iart.ai | MIT |
| `short-form-retention` | iart.ai | MIT |
| `motionmaxxing` | Tejas Makwana | Apache-2.0 |
| `video-structure-analyzer` | sharon-laicc | MIT |
| `youtube-packaging` | Hasan Aboul Hasan | MIT |

`lemo-opuscar` is a launcher only: it downloads the Lemo-Opuscar library (github.com/lemomo-ai/lemo-opuscar) on
first use; that library's own license applies. `real-sfx` ships no sound files: it indexes sound libraries the user
already owns (see its `config.example.json`).
