import { View, Text, Navigator } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'
import './index.scss'

export default function Index() {

  useLoad(() => {
    console.log('Page loaded.')
  })

  return (
    <View className='index'>
      <View className='header'>
        <Text className='title'>WebAR · 图像识别</Text>
        <Text className='subtitle'>Three.js + AR.js 移动端 AR</Text>
      </View>
      
      <View className='features'>
        <Text className='feature-title'>核心功能</Text>
        <Text className='feature-item'>• 摄像头实时预览</Text>
        <Text className='feature-item'>• 图像识别追踪（Hiro 图案）</Text>
        <Text className='feature-item'>• FBX 模型叠加显示</Text>
        <Text className='feature-item'>• 模型居中自动缩放</Text>
        <Text className='feature-item'>• 骨骼动画播放</Text>
        <Text className='feature-item'>• BlackHole SDK 接口保留</Text>
      </View>
      
      <Navigator url='/pages/viewer/index' className='btn-primary'>
        进入 AR 体验
      </Navigator>
      
      <View className='tech-info'>
        <Text className='tech-title'>技术栈</Text>
        <Text className='tech-item'>Taro 3.6 + React 18</Text>
        <Text className='tech-item'>Three.js + AR.js 2.2.2</Text>
        <Text className='tech-item'>Webpack 5 + TypeScript</Text>
        <Text className='tech-item'>FBX 模型支持（原生加载）</Text>
      </View>

      <View className='guide'>
        <Text className='guide-title'>使用说明</Text>
        <Text className='guide-item'>1. 点击「进入 AR 体验」</Text>
        <Text className='guide-item'>2. 允许摄像头权限</Text>
        <Text className='guide-item'>3. 将手机对准 Hiro 识别图</Text>
        <Text className='guide-item'>4. 识别后即可看到 3D 模型叠加</Text>
      </View>
    </View>
  )
}
